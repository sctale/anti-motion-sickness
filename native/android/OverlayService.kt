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
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
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
 */
class OverlayService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private val fusion = SensorFusion()
    private val cueEngine = MotionCueEngine()
    private var overlayManager: OverlayManager? = null

    private var rotationVectorSensor: Sensor? = null
    private var gyroSensor: Sensor? = null
    private var linearAccelSensor: Sensor? = null
    private var accelSensor: Sensor? = null
    private var gravitySensor: Sensor? = null

    private val rotationVectorValues = FloatArray(4)
    private var rotationVectorLength = 0
    private val accelValues = FloatArray(3)
    private var hasAccel = false
    private val linearAccelValues = FloatArray(3)
    private var hasLinearAccel = false
    private val gravityValues = FloatArray(3)
    private var hasGravity = false
    private val gyroValues = FloatArray(3)
    private var hasGyro = false

    private var sensorsRegistered = false
    private var autoMode = true

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_OFF -> unregisterSensors()
                Intent.ACTION_SCREEN_ON -> registerSensors()
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        startForeground(NOTIFICATION_ID, buildNotification())

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        resolveSensors()
        cueEngine.autoMode = autoMode
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
            stopSelf()
            return START_NOT_STICKY
        }

        intent?.let {
            autoMode = it.getBooleanExtra(EXTRA_AUTO_MODE, autoMode)
            cueEngine.autoMode = autoMode
        }

        // 权限被撤销时不要空跑
        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        val shown = overlayManager?.show() ?: false
        if (!shown) {
            stopSelf()
            return START_NOT_STICKY
        }

        return START_STICKY
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_ROTATION_VECTOR -> {
                val n = minOf(event.values.size, rotationVectorValues.size)
                System.arraycopy(event.values, 0, rotationVectorValues, 0, n)
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

        val accel = if (hasAccel) accelValues else null
        val linearAccel = if (hasLinearAccel) linearAccelValues else null
        val gravity = if (hasGravity) gravityValues else null
        if (accel == null && linearAccel == null) return

        val rotationVector = if (rotationVectorLength >= 3) {
            rotationVectorValues.copyOf(rotationVectorLength)
        } else {
            null
        }

        val fused = fusion.update(
            rotationVector = rotationVector,
            accel = accel,
            linearAccel = linearAccel,
            gravity = gravity,
            gyro = if (hasGyro) gyroValues else null
        )
        val cue = cueEngine.update(fused, System.currentTimeMillis())
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
        overlayManager?.hide()
        overlayManager = null
        isRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun copy3(source: FloatArray, target: FloatArray) {
        val n = minOf(source.size, 3)
        System.arraycopy(source, 0, target, 0, n)
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
        if (sensorsRegistered) return
        sensorsRegistered = true
        listOfNotNull(
            rotationVectorSensor,
            gyroSensor,
            linearAccelSensor,
            accelSensor,
            gravitySensor
        ).forEach {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
    }

    private fun unregisterSensors() {
        if (!sensorsRegistered) return
        sensorsRegistered = false
        sensorManager.unregisterListener(this)
        fusion.reset()
        cueEngine.reset()
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
        const val EXTRA_AUTO_MODE = "auto_mode"

        private const val REQUEST_CONTENT = 0
        private const val REQUEST_STOP = 1

        /** 服务真实运行状态（由 OverlayModule 查询，避免「启动成功」误报） */
        @Volatile
        var isRunning: Boolean = false
    }
}