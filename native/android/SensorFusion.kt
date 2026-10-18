package com.anonymous.anticarsicknessrn

import kotlin.math.sqrt

/**
 * 传感器融合（纯 Kotlin，无 Android 依赖，可在 JVM 上测试）：
 *
 * 1. 由 TYPE_ROTATION_VECTOR 维护「设备 → 世界」旋转矩阵；
 * 2. 把线性加速度换算到世界坐标系并做 EMA 平滑；
 *    - 优先使用 TYPE_LINEAR_ACCELERATION（系统已扣重力）
 *    - 退化为 TYPE_ACCELEROMETER − TYPE_GRAVITY
 *    - 再退化为 加速度计 − 低通估计的重力
 * 3. 把角速度换算到世界坐标系，取**垂直轴分量**得到偏航角速度 yawRate，
 *    这样无论手机是竖握（屏幕朝向乘客）还是平放（屏幕朝上），转向都能被正确识别
 *    —— 这是与「只用设备 Z 轴陀螺仪」实现的关键差异；
 * 4. 输出屏幕三轴在世界坐标系中的方向，供上层做姿态自适应的方向映射。
 */
class SensorFusion(
    private val accelAlpha: Float = ACCEL_ALPHA,
    private val yawAlpha: Float = YAW_ALPHA,
    private val gravityAlpha: Float = GRAVITY_ALPHA
) {

    private val rotationMatrix = RotationMath.identity()
    private val gravityEstimate = floatArrayOf(0f, 0f, 0f)
    private var gravityEstimated = false
    private val smoothedHorizontal = floatArrayOf(0f, 0f, 0f)
    private var smoothedYawRate = 0f
    private var initialized = false

    var lastOutput: FusionOutput = FusionOutput.idle()
        private set

    /**
     * @param rotationVector TYPE_ROTATION_VECTOR 原始值（3 或 4 元素），可为 null
     * @param accel          TYPE_ACCELEROMETER 原始值（含重力，m/s²），可为 null
     * @param linearAccel    TYPE_LINEAR_ACCELERATION（已扣重力），可为 null
     * @param gravity        TYPE_GRAVITY，可为 null
     * @param gyro           TYPE_GYROSCOPE（rad/s，设备坐标系），可为 null
     */
    fun update(
        rotationVector: FloatArray?,
        accel: FloatArray?,
        linearAccel: FloatArray?,
        gravity: FloatArray?,
        gyro: FloatArray?
    ): FusionOutput {
        if (rotationVector != null && rotationVector.size >= 3) {
            val m = RotationMath.rotationVectorToMatrix(rotationVector)
            System.arraycopy(m, 0, rotationMatrix, 0, 9)
        }

        val accelDevice = gravityFreeAccel(accel, linearAccel, gravity)
        val worldAccel = if (accelDevice != null) {
            RotationMath.rotate(rotationMatrix, accelDevice)
        } else {
            floatArrayOf(0f, 0f, 0f)
        }
        val horizontal = RotationMath.horizontal(worldAccel)

        val yawRate = if (gyro != null && gyro.size >= 3) {
            val worldGyro = RotationMath.rotate(rotationMatrix, gyro)
            worldGyro[2] // 绕世界垂直轴（真实转向轴）
        } else {
            0f
        }

        if (!initialized) {
            System.arraycopy(horizontal, 0, smoothedHorizontal, 0, 3)
            smoothedYawRate = yawRate
            initialized = true
        } else {
            smoothedHorizontal[0] = ema(smoothedHorizontal[0], horizontal[0], accelAlpha)
            smoothedHorizontal[1] = ema(smoothedHorizontal[1], horizontal[1], accelAlpha)
            smoothedYawRate = ema(smoothedYawRate, yawRate, yawAlpha)
        }

        val output = FusionOutput(
            horizontalAccel = floatArrayOf(smoothedHorizontal[0], smoothedHorizontal[1], 0f),
            yawRate = smoothedYawRate,
            deviceRight = RotationMath.column(rotationMatrix, 0),
            deviceTop = RotationMath.column(rotationMatrix, 1),
            deviceUp = RotationMath.column(rotationMatrix, 2),
            horizontalAccelMagnitude = sqrt(
                smoothedHorizontal[0] * smoothedHorizontal[0] +
                    smoothedHorizontal[1] * smoothedHorizontal[1]
            )
        )
        lastOutput = output
        return output
    }

    fun reset() {
        System.arraycopy(RotationMath.identity(), 0, rotationMatrix, 0, 9)
        gravityEstimate.fill(0f)
        // 重力低通估计必须一起归零：否则 reset 后第一帧会算出
        // 「加速度 − 0」= 含全部重力（≈9.8 m/s²）的假读数，圆点瞬间被打满
        gravityEstimated = false
        smoothedHorizontal.fill(0f)
        smoothedYawRate = 0f
        initialized = false
        lastOutput = FusionOutput.idle()
    }

    /** 扣除重力，优先级：LINEAR_ACCELERATION > ACCELEROMETER − GRAVITY > 加速度计高通 */
    private fun gravityFreeAccel(
        accel: FloatArray?,
        linearAccel: FloatArray?,
        gravity: FloatArray?
    ): FloatArray? {
        if (linearAccel != null && linearAccel.size >= 3) {
            return floatArrayOf(linearAccel[0], linearAccel[1], linearAccel[2])
        }
        if (accel == null || accel.size < 3) return null

        if (gravity != null && gravity.size >= 3) {
            return floatArrayOf(
                accel[0] - gravity[0],
                accel[1] - gravity[1],
                accel[2] - gravity[2]
            )
        }

        // 兜底：低通估计重力方向（设备缓慢转动时足够准确）
        if (!gravityEstimated) {
            System.arraycopy(accel, 0, gravityEstimate, 0, 3)
            gravityEstimated = true
            return floatArrayOf(0f, 0f, 0f)
        }
        gravityEstimate[0] = ema(gravityEstimate[0], accel[0], gravityAlpha)
        gravityEstimate[1] = ema(gravityEstimate[1], accel[1], gravityAlpha)
        gravityEstimate[2] = ema(gravityEstimate[2], accel[2], gravityAlpha)

        return floatArrayOf(
            accel[0] - gravityEstimate[0],
            accel[1] - gravityEstimate[1],
            accel[2] - gravityEstimate[2]
        )
    }

    private fun ema(previous: Float, current: Float, alpha: Float): Float =
        previous + alpha * (current - previous)

    /** 融合结果（世界坐标系） */
    data class FusionOutput(
        /** 世界水平面加速度（x=东, y=北），已平滑 */
        val horizontalAccel: FloatArray,
        /** 绕世界垂直轴的角速度 (rad/s)，左转为正 */
        val yawRate: Float,
        /** 设备 X 轴（屏幕向右）在世界坐标系中的方向 */
        val deviceRight: FloatArray,
        /** 设备 Y 轴（屏幕向上）在世界坐标系中的方向 */
        val deviceTop: FloatArray,
        /** 设备 Z 轴（屏幕法线，指向用户）在世界坐标系中的方向 */
        val deviceUp: FloatArray,
        /** 水平加速度模长 (m/s²) */
        val horizontalAccelMagnitude: Float
    ) {
        companion object {
            fun idle() = FusionOutput(
                horizontalAccel = floatArrayOf(0f, 0f, 0f),
                yawRate = 0f,
                deviceRight = floatArrayOf(1f, 0f, 0f),
                deviceTop = floatArrayOf(0f, 1f, 0f),
                deviceUp = floatArrayOf(0f, 0f, 1f),
                horizontalAccelMagnitude = 0f
            )
        }
    }

    companion object {
        /** 世界水平加速度 EMA 系数（约 50Hz 采样） */
        const val ACCEL_ALPHA = 0.25f
        /** 偏航角速度 EMA 系数（转向要跟手，滤波更轻） */
        const val YAW_ALPHA = 0.35f
        /** 重力低通估计系数 */
        const val GRAVITY_ALPHA = 0.05f
    }
}