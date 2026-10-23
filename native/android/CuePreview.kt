package com.anonymous.anticarsicknessrn

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log

/**
 * App 内的「预览 / 自检」数据源。
 *
 * 存在的理由：这个产品唯一的验证方式原本是「上车试」。用户在客厅里点开 App 按「开始显示」，
 * 如果没上车（自动模式下）什么都不会发生，他就无法区分「功能坏了」「传感器没有」
 * 「我手机放错了」这三种情况 —— 对标方案都在设置界面里给实时预览，就是为了解决这个。
 *
 * 关键约束：
 * - 复用**同一套** [SensorFusion] + [MotionCueEngine] + 同一份 [SettingsStore] 设置，
 *   所以预览里的流动就是真机运行时的流动，不是另写的动画；
 * - 预览强制常显（autoMode=false），否则静止时永远看不到东西；
 * - 只在预览面板打开期间注册传感器，退出/退后台必须 [stop]，
 *   否则等于多挂一条常驻传感器链路。
 */
class CuePreview private constructor(private val context: Context) : SensorEventListener {

    private val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val kit = SensorKit(sensorManager)
    private val fusion = SensorFusion()
    private val input = MotionInput()
    private val engine = MotionCueEngine(
        MotionCueEngine.CueConfig().withSensitivity(SettingsStore.get(context).sensitivity)
    ).apply { autoMode = false }

    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var running = false

    @Volatile
    private var lastSnapshot = Snapshot()

    /** 预览输出（dp 位移 + 强度 + 姿态可信度），供 JS 轮询 */
    data class Snapshot(
        val offsetXdp: Float = 0f,
        val offsetYdp: Float = 0f,
        val magnitude01: Float = 0f,
        val confidence01: Float = 1f,
        val active: Boolean = false
    )

    val sensorSummary: String get() = kit.describe()
    val sensorsDegraded: Boolean get() = kit.degraded()

    fun start() {
        if (running) return
        if (kit.isEmpty()) {
            Log.w(TAG, "没有可用传感器，预览不可用")
            return
        }
        val t = HandlerThread("OverlayPreview").also { it.start() }
        thread = t
        val h = Handler(t.looper)
        handler = h
        running = true
        fusion.reset()
        input.reset()
        engine.reset()

        h.post {
            val rate = SensorManager.SENSOR_DELAY_GAME
            kit.available().forEach {
                sensorManager.registerListener(this, it, rate, h)
            }
        }
    }

    fun stop() {
        if (!running) return
        running = false
        val h = handler
        if (h != null) {
            h.post {
                sensorManager.unregisterListener(this)
                fusion.reset()
                input.reset()
                engine.reset()
            }
        }
        thread?.quitSafely()
        thread = null
        handler = null
        lastSnapshot = Snapshot()
    }

    fun snapshot(): Snapshot = lastSnapshot

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_ROTATION_VECTOR -> input.onRotationVector(event.values)
            Sensor.TYPE_LINEAR_ACCELERATION -> input.onLinearAcceleration(event.values)
            Sensor.TYPE_ACCELEROMETER -> input.onAcceleration(event.values)
            Sensor.TYPE_GRAVITY -> input.onGravity(event.values)
            Sensor.TYPE_GYROSCOPE -> input.onGyroscope(event.values)
            else -> return
        }

        val now = android.os.SystemClock.elapsedRealtime()
        try {
            val fused = input.fuse(fusion) ?: return
            val cue = engine.update(fused, now)
            lastSnapshot = Snapshot(
                offsetXdp = cue.offsetXdp,
                offsetYdp = cue.offsetYdp,
                magnitude01 = cue.magnitude01,
                confidence01 = cue.confidence01,
                active = true
            )
        } catch (t: Throwable) {
            // 预览崩一次就该安静停掉，不能把宿主进程带下去
            Log.w(TAG, "预览计算失败，停止预览", t)
            stop()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    companion object {
        private const val TAG = "CuePreview"

        @Volatile
        private var instance: CuePreview? = null

        fun get(context: Context): CuePreview = synchronized(this) {
            instance ?: CuePreview(context.applicationContext).also { instance = it }
        }
    }
}
