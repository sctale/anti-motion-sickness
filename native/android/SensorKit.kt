package com.anonymous.anticarsicknessrn

import android.hardware.Sensor
import android.hardware.SensorManager

/**
 * 传感器选型（Android 侧唯一真源）。
 *
 * 常驻服务与 App 内预览必须用同一套选型与回退规则，否则「预览里动得很好」
 * 和「真机上不灵」会出现无法解释的差异。回退顺序与算法层一致：
 * 优先线性加速度，没有才用加速度计 + 重力（融合层还能再退回低通估计）。
 */
class SensorKit(private val sensorManager: SensorManager) {

    val rotationVector: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    val gyro: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    val linearAccel: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)

    /** 只在没有线性加速度时才需要加速度计，避免多挂一路同源数据 */
    val accel: Sensor? =
        if (linearAccel == null) sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) else null
    val gravity: Sensor? =
        if (linearAccel == null) sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY) else null

    fun available(): List<Sensor> = listOfNotNull(rotationVector, gyro, linearAccel, accel, gravity)

    fun isEmpty(): Boolean = available().isEmpty()

    /**
     * 给界面看的一句话说明，例如「旋转矢量 + 陀螺仪 + 线性加速度」。
     * 用户需要知道这台机器实际用了哪些传感器 —— 缺陀螺仪时方向提示会明显变钝。
     */
    fun describe(): String {
        val parts = buildList {
            if (rotationVector != null) add("旋转矢量")
            if (gyro != null) add("陀螺仪")
            if (linearAccel != null) add("线性加速度") else if (accel != null) add("加速度计+重力")
        }
        return if (parts.isEmpty()) "无可用运动传感器" else parts.joinToString(" + ")
    }

    /** 关键传感器是否齐全：缺旋转矢量或陀螺仪时，转向提示的可信度会下降 */
    fun degraded(): Boolean = rotationVector == null || gyro == null
}
