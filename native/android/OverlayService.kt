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

    private var rotationVectorSensor: Sensor? = null
    private var gyroSensor: Sensor? = null
    private var linearAccelSensor: Sensor? = null
    private var accelSensor: Sensor? = null
    private var gravitySensor: Sensor? = null

    // 传感器原始值（4 槽容纳 Android 旋转矢量的 w 分量；长度单独记录）
    private val rotationVectorRaw = FloatArray(4)
    private var rotationVectorLength = 0
    private val rotationVector3 = FloatArray(3)
    private val rotationVector4 = FloatArray(4)
    private val accelValues = FloatArray(3)
    private var hasAccel = false
    private val linearAccelValues = FloatArray(3)
    private var hasLinearAccel = false
    private val gravityValues = FloatArray(3)
    private var hasGravity = false
    private val gyroValues = FloatArray(3)
    private var hasGyro = false

    private var sensorsRegistered = false

    /** 合并刷新：true 表示已排队一次延迟计算 */
    private var pipelineScheduled = false
    private var lastPipelineAtMs = 0L

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
        startForegroundSafely()

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager

        // 传感器线程要先建好：applySettings / registerSensors 都是往它投递任务
        val thread = HandlerThread("OverlaySensor").also { it.start() }
        sensorThread = thread
        sensorHandler = Handler(thread.looper)

        resolveSensors()
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
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            markStopped()
            stopSelf()
            return START_NOT_STICKY
        }

        // 每次启动都从 SharedPreferences 重新读设置：磁贴、App 内开关、
        // 以及系统重启服务，走的都是同一条路径，避免两处真源
        applySettings()

        // 服务已在跑时再次 startForegroundService（改设置会这样）也需要重新确认前台状态，
        // 否则 Android 8+ 可能判定「startForeground 未在时限内调用」
        startForegroundSafely()

        // 权限被撤销时不要空跑
        if (!Settings.canDrawOverlays(this)) {
            markStopped(REASON_PERMISSION_REVOKED)
            stopSelf()
            return START_NOT_STICKY
        }
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

    /** Android 12+ 要求显式声明前台服务类型；旧版本或异常时退回无类型调用 */
    private fun startForegroundSafely() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } catch (e: Exception) {
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_ROTATION_VECTOR -> {
                val n = minOf(event.values.size, rotationVectorRaw.size)
                System.arraycopy(event.values, 0, rotationVectorRaw, 0, n)
                rotationVectorLength = n
            }
            Sensor.TYPE_LINEAR_ACCELERATION -> {
                copy3(event.values, linearAccelValues)
                hasLinearAccel = true
            }
            Sensor.TYPE_ACCELEROMETER -> {
                copy3(event.values, accelValues)
                hasAccel = true
            }
            Sensor.TYPE_GRAVITY -> {
                copy3(event.values, gravityValues)
                hasGravity = true
            }
            Sensor.TYPE_GYROSCOPE -> {
                copy3(event.values, gyroValues)
                hasGyro = true
            }
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
        if (hasAccel || hasLinearAccel) lastPipelineAtMs = now

        val accel = if (hasAccel) accelValues else null
        val linearAccel = if (hasLinearAccel) linearAccelValues else null
        if (accel == null && linearAccel == null) return

        val rotationVector = when (rotationVectorLength) {
            0 -> null
            3 -> {
                System.arraycopy(rotationVectorRaw, 0, rotationVector3, 0, 3)
                rotationVector3
            }
            else -> {
                System.arraycopy(rotationVectorRaw, 0, rotationVector4, 0, 4)
                rotationVector4
            }
        }

        val fused = fusion.update(
            rotationVector = rotationVector,
            accel = accel,
            linearAccel = linearAccel,
            gravity = if (hasGravity) gravityValues else null,
            gyro = if (hasGyro) gyroValues else null
        )
        // @Volatile 引用只读一次，保证一帧内用的是同一个引擎实例
        val cue = cueEngine.update(fused, now)
        overlayManager?.update(cue.offsetXdp, cue.offsetYdp, cue.alpha, cue.magnitude01)
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

    private fun copy3(source: FloatArray, target: FloatArray) {
        val n = minOf(source.size, 3)
        System.arraycopy(source, 0, target, 0, n)
    }

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
        rotationVectorSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        gyroSensor = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
        linearAccelSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
        if (linearAccelSensor == null) {
            // 退化路径：加速度计 − 重力（无重力传感器时融合层会做低通估计）
            accelSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
            gravitySensor = sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY)
        }
    }

    private fun registerSensors() {
        val handler = sensorHandler ?: return
        // 注册状态只在传感器线程读写，避免息屏广播（主线程）与回调线程竞态
        handler.post {
            if (sensorsRegistered) return@post
            sensorsRegistered = true
            listOfNotNull(
                rotationVectorSensor,
                gyroSensor,
                linearAccelSensor,
                accelSensor,
                gravitySensor
            ).forEach {
                sensorManager.registerListener(
                    this, it, SensorManager.SENSOR_DELAY_GAME, handler
                )
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
            .setContentTitle("防晕车提示运行中")
            .setContentText("屏幕两侧显示运动提示圆点")
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
                "防晕车助手",
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
    }
}
