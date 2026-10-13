package com.anonymous.anticarsicknessrn

import kotlin.math.sqrt

/**
 * 纯数学工具：旋转矢量（四元数）→ 旋转矩阵、向量运算。
 *
 * 约定与 Android SensorManager.getRotationMatrixFromVector 完全一致：
 * 世界坐标系 X 东 / Y 北 / Z 天，矩阵 R 满足 world = R * device。
 *
 * 不依赖任何 Android API，可直接在 JVM 上单元测试（见 tools/verify）。
 */
object RotationMath {

    /** 3x3 单位矩阵（行优先） */
    fun identity(): FloatArray = floatArrayOf(
        1f, 0f, 0f,
        0f, 1f, 0f,
        0f, 0f, 1f
    )

    /**
     * TYPE_ROTATION_VECTOR（3 或 4 元素）→ 设备到世界的旋转矩阵。
     * 3 元素时按 Android 约定补 w = sqrt(1 - x² - y² - z²)。
     */
    fun rotationVectorToMatrix(rotationVector: FloatArray): FloatArray {
        if (rotationVector.size < 3) return identity()

        val x = rotationVector[0]
        val y = rotationVector[1]
        val z = rotationVector[2]
        var w: Float
        if (rotationVector.size >= 4) {
            w = rotationVector[3]
        } else {
            val t = 1f - x * x - y * y - z * z
            w = if (t > 0f) sqrt(t) else 0f
        }

        // 归一化，避免传感器噪声导致矩阵非正交
        val norm = sqrt(x * x + y * y + z * z + w * w)
        if (norm <= 1e-6f) return identity()
        val qx = x / norm
        val qy = y / norm
        val qz = z / norm
        val qw = w / norm

        val xx = qx * qx
        val yy = qy * qy
        val zz = qz * qz
        val xy = qx * qy
        val xz = qx * qz
        val yz = qy * qz
        val wx = qw * qx
        val wy = qw * qy
        val wz = qw * qz

        return floatArrayOf(
            1f - 2f * (yy + zz), 2f * (xy - wz), 2f * (xz + wy),
            2f * (xy + wz), 1f - 2f * (xx + zz), 2f * (yz - wx),
            2f * (xz - wy), 2f * (yz + wx), 1f - 2f * (xx + yy)
        )
    }

    /** 矩阵作用于向量：world = R * device */
    fun rotate(matrix: FloatArray, v: FloatArray): FloatArray = floatArrayOf(
        matrix[0] * v[0] + matrix[1] * v[1] + matrix[2] * v[2],
        matrix[3] * v[0] + matrix[4] * v[1] + matrix[5] * v[2],
        matrix[6] * v[0] + matrix[7] * v[1] + matrix[8] * v[2]
    )

    /** 取矩阵第 col 列：设备坐标轴 col 在世界坐标系中的方向 */
    fun column(matrix: FloatArray, col: Int): FloatArray = floatArrayOf(
        matrix[col], matrix[3 + col], matrix[6 + col]
    )

    /** 向量在水平面（世界 X-Y 平面）内的分量，Z 置 0 */
    fun horizontal(v: FloatArray): FloatArray = floatArrayOf(v[0], v[1], 0f)

    fun normalize(v: FloatArray): FloatArray {
        val n = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
        if (n <= 1e-6f) return floatArrayOf(0f, 0f, 0f)
        return floatArrayOf(v[0] / n, v[1] / n, v[2] / n)
    }

    fun dot(a: FloatArray, b: FloatArray): Float =
        a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

    fun cross(a: FloatArray, b: FloatArray): FloatArray = floatArrayOf(
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    )

    fun magnitude(v: FloatArray): Float =
        sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
}