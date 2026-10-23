package com.anonymous.anticarsicknessrn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * 前台服务：监听传感器 → 融合 → 运动提示引擎 → 驱动悬浮窗圆点。
 *
 * 对标 Apple Vehicle Motion Cues / Google Motion Assist：
 * - 传感器可用性自适应（无线性加速度传感器时退回加速度计 − 重力）
 * - 屏幕息屏时注销传感器，亮屏恢复（省电）
 * - 通知栏提供「停止」操作（对应 Google 的「点通知关闭」）
 * - 自动模式：检测到车辆运动才显示圆点，静止一段时间后淡出
 *
 * 运行模型（避免常驻服务发热）：
 * - 传感器回调跑在独立的 [HandlerThread]，不占用主线程；
 * - 多路传感器（旋转矢量 / 陀螺仪 / 线性加速度）各自的事件只做「存最新值」，
 *   真正的融合 + 绘图刷新按 [TARGET_UI_HZ] 合并执行一次，不做每事件全量重算；
 * - 原始值缓冲复用，去掉了每帧的 `copyOf()` 分配
 *   （融合层内部仍有少量小数组分配，60Hz 下可忽略，不再为了零分配把接口改成可变复用对象）。
 *
 * 线程约定：**只有传感器线程**读写 [fusion]、[cueEngine] 的运行时状态与 `sensorsRegistered`；
 * 主线程（onStartCommand / 息屏广播）通过 `sensorHandler.post` 投递注册、注销与设置重载，
 * 不直接改这些对象。跨线程读取的引用（引擎、悬浮窗管理器）标 `@Volatile`。
 */
class OverlayService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private val fusion = SensorFusion()

    @Volatile
    private var cueEngine = MotionCueEngine()

    @Volatile
    private var overlayManager: OverlayManager? = null

    private var sensorThread: HandlerThread? = null
    private var sensorHandler: Handler? = null

    /**
     * 传感器选型与采样缓存都不在这里自己实现：选型走 [SensorKit]，
     * 缓存与融合入参走 [MotionInput]，两者与 App 内预览共用同一份代码。
     * 否则「预览里看着对、真机上不灵」这类差异根本没有可比性。
     */
    private lateinit var sensorKit: SensorKit
    private val input = MotionInput()

    private var sensorsRegistered = false

    /**
     * 采样档位只在传感器线程上决策。`requestedSamplingLevel` 是「已经投递出去的目标」：
     * 投递前先去重，失败路径会把它按回 HIGH，下一帧自然再试。
     */
    private val samplingPolicy = SamplingPolicy()
    private var requestedSamplingLevel = SamplingLevel.HIGH

    /** 合并刷新：true 表示已排队一次延迟计算 */
    private var pipelineScheduled = false
    private var lastPipelineAtMs = 0L
    private var pipelineFailures = 0

    private val pipelineRunnable = Runnable { runPipeline() }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                // 息屏时圆点不可见，直接停掉传感器；亮屏恢复
                Intent.ACTION_SCREEN_OFF -> {
                    unregisterSensors()
                    overlayManager?.setVisible(false)
                }
                Intent.ACTION_SCREEN_ON -> {
                    registerSensors()
                    overlayManager?.setVisible(true)
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        if (!startForegroundSafely()) {
            markStopped(REASON_FGS_DENIED)
            stopSelf()
            return
        }

        // 这一段全都是会抛的系统调用：getSystemService 强转（个别 ROM 返回的实例类型不符）、
        // HandlerThread/Looper、构造悬浮窗 View、读 SharedPreferences、注册广播。
        // 放在生命周期回调里逃逸出去就是进程崩溃 = 又一种「点开就闪退」，所以整体兜住。
        try {
            sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager

            // 传感器线程要先建好：applySettings / registerSensors 都是往它投递任务
            val thread = HandlerThread("OverlaySensor").also { it.start() }
            sensorThread = thread
            sensorHandler = Handler(thread.looper)

            resolveSensors()
            if (sensorKit.isEmpty()) {
                // 连加速度计都没有的机器没法给出任何提示，与其让圆点冻在那里，不如直说
                Log.e(TAG, "本机没有任何可用的运动传感器，停止服务")
                markStopped(REASON_NO_SENSORS)
                stopSelf()
                return
            }

            applySettings()
            overlayManager = OverlayManager(this)

            registerSensors()
            ContextCompat.registerReceiver(
                this,
                screenReceiver,
                IntentFilter().apply {
                    addAction(Intent.ACTION_SCREEN_ON)
                    addAction(Intent.ACTION_SCREEN_OFF)
                },
                ContextCompat.RECEIVER_NOT_EXPORTED
            )
        } catch (t: Throwable) {
            Log.e(TAG, "服务初始化失败，停止服务", t)
            cleanupAfterFailure()
            markStopped(REASON_START_FAILED)
            stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            markStopped()
            stopSelf()
            return START_NOT_STICKY
        }

        // 每次启动都从 SharedPreferences 重新读设置：磁贴、App 内开关、
        // 以及系统重启服务，走的都是同一条路径，避免两处真源
        try {
            applySettings()

            // 服务已在跑时再次 startForegroundService（改设置会这样）也需要重新确认前台状态，
            // 否则 Android 8+ 可能判定「startForeground 未在时限内调用」
            if (!startForegroundSafely()) {
                markStopped(REASON_FGS_DENIED)
                stopSelf()
                return START_NOT_STICKY
            }

            // 权限被撤销时不要空跑
            if (!Settings.canDrawOverlays(this)) {
                markStopped(REASON_PERMISSION_REVOKED)
                stopSelf()
                return START_NOT_STICKY
            }
        } catch (t: Throwable) {
            Log.e(TAG, "启动流程异常，停止服务", t)
            cleanupAfterFailure()
            markStopped(REASON_START_FAILED)
            stopSelf()
            return START_NOT_STICKY
        }

        // onCreate 兜底失败后走到这里时管理器可能还没建起来，这里同样不能当它存在
        val shown = overlayManager?.show() ?: false
        if (!shown) {
            markStopped(REASON_OVERLAY_ADD_FAILED)
            stopSelf()
            return START_NOT_STICKY
        }

        overlayShown = true
        startReason = null

        return START_STICKY
    }

    /** 初始化失败后的收尾：把已经建起来的东西放掉，避免留下半个服务 */
    private fun cleanupAfterFailure() {
        try {
            unregisterSensors()
        } catch (t: Throwable) {
            Log.w(TAG, "失败收尾时注销传感器又出错", t)
        }
        try {
            unregisterReceiver(screenReceiver)
        } catch (_: Exception) {
            // 没注册成功过，忽略
        }
        sensorThread?.quitSafely()
        sensorThread = null
        sensorHandler = null
    }

    /**
     * 进入前台，返回是否成功。
     *
     * 这里绝不能让异常逃出去：onCreate / onStartCommand 抛出未捕获异常就是整个进程崩溃，
     * 用户看到的正是「点开就闪退」。Android 12+ 的后台启动限制、通知被禁用等情况
     * 都可能让 startForeground 抛 ForegroundServiceStartNotAllowedException，
     * 所以失败时返回 false，由调用方 stopSelf() 体面收场。
     */
    private fun startForegroundSafely(): Boolean {
        val notification = try {
            buildNotification()
        } catch (e: Throwable) {
            Log.e(TAG, "构造前台通知失败，停止服务", e)
            return false
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
                return true
            } catch (e: Throwable) {
                Log.w(TAG, "带类型的 startForeground 失败，退回无类型调用", e)
            }
        }

        return try {
            startForeground(NOTIFICATION_ID, notification)
            true
        } catch (e: Throwable) {
            Log.e(TAG, "startForeground 被系统拒绝，停止服务", e)
            false
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_ROTATION_VECTOR -> input.onRotationVector(event.values)
            Sensor.TYPE_LINEAR_ACCELERATION -> input.onLinearAcceleration(event.values)
            Sensor.TYPE_ACCELEROMETER -> input.onAcceleration(event.values)
            Sensor.TYPE_GRAVITY -> input.onGravity(event.values)
            Sensor.TYPE_GYROSCOPE -> input.onGyroscope(event.values)
            else -> return
        }

        schedulePipeline()
    }

    /**
     * 多路传感器在一个刷新周期内会各自触发回调，这里合并成一次计算：
     * 距上次不足 [TARGET_UI_HZ] 帧间隔时排队补一次，否则立即执行。
     */
    private fun schedulePipeline() {
        val handler = sensorHandler ?: return
        val now = SystemClock.elapsedRealtime()
        val intervalMs = (1000L / TARGET_UI_HZ).toLong()
        val elapsed = if (lastPipelineAtMs == 0L) intervalMs else now - lastPipelineAtMs

        if (elapsed >= intervalMs) {
            if (pipelineScheduled) {
                handler.removeCallbacks(pipelineRunnable)
                pipelineScheduled = false
            }
            runPipeline()
        } else if (!pipelineScheduled) {
            pipelineScheduled = true
            handler.postDelayed(pipelineRunnable, intervalMs - elapsed)
        }
    }

    private fun runPipeline() {
        pipelineScheduled = false
        val now = SystemClock.elapsedRealtime()
        if (!input.hasMotionData()) return
        lastPipelineAtMs = now

        // 单帧异常不能放出去：这里跑在传感器线程上，抛出即整个进程崩溃。
        // 但也不能像旧版那样无声吞掉每一帧 —— 连续失败到上限就主动收场并留下原因。
        try {
            val fused = input.fuse(fusion) ?: return
            // @Volatile 引用只读一次，保证一帧内用的是同一个引擎实例
            val cue = cueEngine.update(fused, now)
            overlayManager?.update(cue.offsetXdp, cue.offsetYdp, cue.alpha, cue.magnitude01)
            pipelineFailures = 0

            // 常驻服务的耗电主要来采样本身：静止就降档，一动立刻回到最高档。
            // 圆点还在显示时不降档 —— 自动模式有淡出窗口、巡航强度可能低于门限，
            // 这时降到 200ms 会让下一次转弯慢半拍，跟手性优先。
            val desiredLevel = samplingPolicy.update(now, cue.magnitude01, cue.alpha > 0.01f)
            if (desiredLevel != requestedSamplingLevel) requestSamplingLevel(desiredLevel)
        } catch (e: Throwable) {
            pipelineFailures++
            if (pipelineFailures >= MAX_PIPELINE_FAILURES) {
                Log.e(TAG, "运动提示连续 $pipelineFailures 帧失败，停止传感器与悬浮窗", e)
                markStopped(REASON_PIPELINE_FAILED)
                unregisterSensors()
                stopSelf()
            } else {
                Log.w(TAG, "运动提示单帧计算失败（$pipelineFailures/$MAX_PIPELINE_FAILURES）", e)
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    override fun onDestroy() {
        try {
            unregisterReceiver(screenReceiver)
        } catch (_: Exception) {
            // 忽略未注册的情况
        }
        unregisterSensors()
        sensorThread?.quitSafely()
        sensorThread = null
        sensorHandler = null
        overlayManager?.hide()
        overlayManager = null
        isRunning = false
        overlayShown = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    /**
     * 读取并应用用户设置（自动模式 + 灵敏度）。
     * 引擎整体替换，所以替换动作投递到传感器线程：
     * 传感器线程可能正在跑 update()，在主线程直接换引用会读到半新半旧的一帧。
     */
    private fun applySettings() {
        val settings = SettingsStore.get(this)
        val engine = MotionCueEngine(
            MotionCueEngine.CueConfig().withSensitivity(settings.sensitivity)
        )
        engine.autoMode = settings.autoMode

        val handler = sensorHandler
        if (handler == null) {
            // onCreate 早期还没有线程，此时不存在并发读者
            cueEngine = engine
            return
        }
        handler.post { cueEngine = engine }
    }

    private fun resolveSensors() {
        sensorKit = SensorKit(sensorManager)
        // 界面与日志都要能说出「这台机器实际用了哪些传感器」；缺陀螺仪时转向提示会明显变钝
        sensorSummary = sensorKit.describe()
        if (sensorKit.degraded()) {
            Log.w(TAG, "传感器不齐全，转向提示可能变钝：$sensorSummary")
        }
    }

    private fun activeSensors(): List<Sensor> = sensorKit.available()

    /** SensorManager 没有「修改采样率」的公开 API，改档位只能注销后按新周期重新注册 */
    private fun samplingRateFor(level: SamplingLevel): Int = when (level) {
        SamplingLevel.HIGH -> SensorManager.SENSOR_DELAY_GAME
        SamplingLevel.MEDIUM -> SensorManager.SENSOR_DELAY_UI
        SamplingLevel.LOW -> SensorManager.SENSOR_DELAY_NORMAL
    }

    private fun registerSensors() {
        val handler = sensorHandler ?: return
        // 注册状态只在传感器线程读写，避免息屏广播（主线程）与回调线程竞态
        handler.post {
            if (sensorsRegistered) return@post
            sensorsRegistered = true
            val rate = samplingRateFor(requestedSamplingLevel)
            activeSensors().forEach {
                sensorManager.registerListener(this, it, rate, handler)
            }
        }
    }

    /**
     * 投递一次采样档位切换。从 `onSensorChanged` 里同步调用（runPipeline 可能被就地执行），
     * 因此必须 post 到下一轮循环再动 SensorManager，避免在回调里注销自己。
     */
    private fun requestSamplingLevel(level: SamplingLevel) {
        if (level == requestedSamplingLevel) return
        requestedSamplingLevel = level
        val handler = sensorHandler ?: return
        handler.post {
            if (!sensorsRegistered) {
                // 还没注册（息屏期间）：等 registerSensors 用新档位注册即可
                return@post
            }
            val rate = samplingRateFor(level)
            try {
                sensorManager.unregisterListener(this)
                activeSensors().forEach {
                    sensorManager.registerListener(this, it, rate, handler)
                }
            } catch (e: Throwable) {
                // 换档半途失败最坏会让传感器全掉，那就整体重来一次并回到最高档，
                // 宁可多耗电也不能让圆点悄悄冻住
                Log.w(TAG, "切换采样档位失败，重建传感器注册", e)
                try {
                    sensorManager.unregisterListener(this)
                    requestedSamplingLevel = SamplingLevel.HIGH
                    activeSensors().forEach {
                        sensorManager.registerListener(
                            this, it, samplingRateFor(SamplingLevel.HIGH), handler
                        )
                    }
                } catch (e2: Exception) {
                    Log.e(TAG, "重建传感器注册仍然失败，停止传感器与悬浮窗", e2)
                    markStopped(REASON_SENSOR_RESTART_FAILED)
                    sensorsRegistered = false
                    stopSelf()
                }
            }
        }
    }

    private fun unregisterSensors() {
        val handler = sensorHandler
        if (handler == null) {
            // 线程已退出（onDestroy 尾部）：就地注销，确保不会再有回调
            if (sensorsRegistered) {
                sensorsRegistered = false
                sensorManager.unregisterListener(this)
            }
            return
        }
        handler.post {
            if (!sensorsRegistered) return@post
            sensorsRegistered = false
            handler.removeCallbacks(pipelineRunnable)
            pipelineScheduled = false
            sensorManager.unregisterListener(this)
            fusion.reset()
            cueEngine.reset()
            input.reset()
            // 重新亮屏后按最高档重新开始计时，避免「息屏前静止了很久」直接落到省电档
            samplingPolicy.reset()
            requestedSamplingLevel = SamplingLevel.HIGH
        }
    }

    /** 记录本次启动失败原因，供 OverlayModule 精确报错；reason=null 表示用户主动停止 */
    private fun markStopped(reason: String? = null) {
        startReason = reason
        overlayShown = false
    }

    private fun buildNotification(): Notification {
        createChannel()

        val contentIntent = PendingIntent.getActivity(
            this,
            REQUEST_CONTENT,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopIntent = PendingIntent.getService(
            this,
            REQUEST_STOP,
            Intent(this, OverlayService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(UiStrings.NOTIFICATION_TITLE)
            .setContentText(UiStrings.NOTIFICATION_TEXT)
            .setSmallIcon(notificationIconRes())
            .setContentIntent(contentIntent)
            .addAction(0, "停止", stopIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                UiStrings.CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                setShowBadge(false)
            }
        )
    }

    /** 由 config plugin 注入的通知小图标；缺失时退回系统图标 */
    private fun notificationIconRes(): Int {
        val id = resources.getIdentifier("ic_stat_motion", "drawable", packageName)
        return if (id != 0) id else android.R.drawable.ic_menu_view
    }

    companion object {
        const val CHANNEL_ID = "overlay_service"
        const val NOTIFICATION_ID = 1001
        const val ACTION_STOP = "com.anonymous.anticarsicknessrn.action.STOP"

        /**
         * 唯一的启动入口：App 内按钮（OverlayModule）与 Quick Settings 磁贴
         * 都走这里，设置从 SharedPreferences 读，不再用 Intent extra 传参。
         */
        fun start(context: Context) {
            val intent = Intent(context, OverlayService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, OverlayService::class.java))
        }

        /** 启动失败原因（供 JS 给出可读提示） */
        const val REASON_PERMISSION_REVOKED = "PERMISSION_REVOKED"
        const val REASON_OVERLAY_ADD_FAILED = "OVERLAY_ADD_FAILED"

        /** 系统拒绝进入前台（Android 12+ 后台启动限制等） */
        const val REASON_FGS_DENIED = "FOREGROUND_SERVICE_DENIED"

        /** 本机没有任何可用的运动传感器，无法给出提示 */
        const val REASON_NO_SENSORS = "NO_SENSORS"

        /** 服务初始化 / 启动流程自身抛错（兜住后体面停止，不再让异常穿透生命周期回调） */
        const val REASON_START_FAILED = "START_FAILED"

        /** 切换采样档位时传感器注册重建失败 */
        const val REASON_SENSOR_RESTART_FAILED = "SENSOR_RESTART_FAILED"

        /** 运动提示计算连续失败，服务自行收场 */
        const val REASON_PIPELINE_FAILED = "PIPELINE_FAILED"

        /** 连续多少帧计算失败就停止服务（避免每帧刷日志又不停重试） */
        private const val MAX_PIPELINE_FAILURES = 30

        private const val TAG = "OverlayService"

        private const val REQUEST_CONTENT = 0
        private const val REQUEST_STOP = 1

        /** 圆点刷新帧率：传感器按 GAME 采样，融合与绘制合并到该帧率即可 */
        const val TARGET_UI_HZ = 60

        /** 服务真实运行状态（由 OverlayModule 查询，避免「启动成功」误报） */
        @Volatile
        var isRunning: Boolean = false

        /** 悬浮窗是否真的挂上去了（比 isRunning 更接近「用户能看见圆点」） */
        @Volatile
        var overlayShown: Boolean = false

        /** 最近一次启动失败原因；成功或用户主动停止时为 null */
        @Volatile
        var startReason: String? = null

        /** 本机实际用到的传感器说明（给界面看，例如「旋转矢量 + 陀螺仪 + 线性加速度」） */
        @Volatile
        var sensorSummary: String = ""
    }
}
