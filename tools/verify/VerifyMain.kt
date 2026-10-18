package com.anonymous.anticarsicknessrn

/**
 * 算法验证台（JVM 上运行，不需要真机）：
 * 用合成传感器数据驱动与 Android 层完全相同的 Kotlin 算法，
 * 校验圆点位移的方向语义、姿态自适应、死区、自动模式等关键行为。
 *
 * 世界坐标系：X 东、Y 北、Z 天；车辆朝北行驶，乘客面朝车头（北）。
 */

private val WORLD_UP = floatArrayOf(0f, 0f, 1f)
private var failures = 0

fun main() {
    println("=== 运动提示算法验证（合成数据）===")

    // 姿态 1：竖握手机（屏幕朝乘客、顶部朝上）
    //  设备 X → 东, 设备 Y → 天, 设备 Z → 南
    //  旋转矩阵 = Rx(90°)，旋转矢量 = (sin45°, 0, 0)
    val upright = floatArrayOf(0.70710678f, 0f, 0f)

    // 姿态 2：平放手机（屏幕朝上、顶部朝北）
    //  旋转矢量 = (0,0,0) → 单位矩阵
    val flat = floatArrayOf(0f, 0f, 0f)

    val uprightR = RotationMath.rotationVectorToMatrix(upright)
    check("竖握姿态矩阵 column2 = 南", approx(RotationMath.column(uprightR, 2), floatArrayOf(0f, -1f, 0f)))
    check("竖握姿态矩阵 column1 = 天", approx(RotationMath.column(uprightR, 1), floatArrayOf(0f, 0f, 1f)))

    scenarioUprightAccelerate(upright)
    scenarioUprightBrake(upright)
    scenarioUprightTurnLeft(upright)
    scenarioUprightTurnRight(upright)
    scenarioFlatTurnLeft(flat)
    scenarioFlatAccelerate(flat)
    scenarioNoiseRejection(upright)
    scenarioAutoVisibility(upright)
    scenarioGravityFallback(upright)
    scenarioHeadingEast()
    scenarioLimits(upright)
    scenarioTiltedGravityOnly()

    println()
    if (failures == 0) {
        println("全部断言通过 ✓")
    } else {
        println("存在 $failures 处失败 ✗")
        kotlin.system.exitProcess(1)
    }
}

// ---------------- 场景 ----------------

private fun scenarioUprightAccelerate(rv: FloatArray) {
    println("\n[场景 1] 竖握 + 车辆加速前进 2 m/s²（期望：圆点向下流动）")
    val out = run(rv, worldAccel = floatArrayOf(0f, 2f, 0f), yawRate = 0f, seconds = 1.5f)
    report(out)
    check("加速前进 → offsetYdp 为正（向下）", out.offsetYdp > 20f)
    check("加速前进 → 水平方向基本不动", kotlin.math.abs(out.offsetXdp) < 3f)
}

private fun scenarioUprightBrake(rv: FloatArray) {
    println("\n[场景 2] 竖握 + 刹车 2 m/s²（期望：圆点向上流动）")
    val out = run(rv, worldAccel = floatArrayOf(0f, -2f, 0f), yawRate = 0f, seconds = 1.5f)
    report(out)
    check("刹车 → offsetYdp 为负（向上）", out.offsetYdp < -20f)
}

private fun scenarioUprightTurnLeft(rv: FloatArray) {
    println("\n[场景 3] 竖握 + 左转（偏航 +0.4 rad/s，向心加速度朝西 1.5 m/s²）")
    println("        期望：圆点向右；旧实现仅取设备 Z 轴陀螺仪，此姿态下为 0（完全无响应）")
    val legacyGyroZ = deviceFromWorld(rv, floatArrayOf(0f, 0f, 0.4f))[2]
    println("        · 旧实现读到 gyroZ(设备) = ${fmt(legacyGyroZ)} rad/s")
    val out = run(rv, worldAccel = floatArrayOf(-1.5f, 0f, 0f), yawRate = 0.4f, seconds = 1.5f)
    report(out)
    check("左转 → offsetXdp 为正（向右）", out.offsetXdp > 20f)
    check("左转在竖握姿态下旧实现无响应（gyroZ≈0）", kotlin.math.abs(legacyGyroZ) < 0.05f)
}

private fun scenarioUprightTurnRight(rv: FloatArray) {
    println("\n[场景 4] 竖握 + 右转（偏航 -0.4 rad/s，向心加速度朝东 1.5 m/s²）")
    val out = run(rv, worldAccel = floatArrayOf(1.5f, 0f, 0f), yawRate = -0.4f, seconds = 1.5f)
    report(out)
    check("右转 → offsetXdp 为负（向左）", out.offsetXdp < -20f)
}

private fun scenarioFlatTurnLeft(rv: FloatArray) {
    println("\n[场景 5] 平放 + 左转（期望：圆点向右；旧实现在该姿态下可响应）")
    val legacyGyroZ = deviceFromWorld(rv, floatArrayOf(0f, 0f, 0.4f))[2]
    println("        · 旧实现读到 gyroZ(设备) = ${fmt(legacyGyroZ)} rad/s")
    val out = run(rv, worldAccel = floatArrayOf(-1.5f, 0f, 0f), yawRate = 0.4f, seconds = 1.5f)
    report(out)
    check("左转（平放） → offsetXdp 为正", out.offsetXdp > 20f)
    check("平放姿态下旧实现同样能读到 0.4", legacyGyroZ > 0.35f)
}

private fun scenarioFlatAccelerate(rv: FloatArray) {
    println("\n[场景 6] 平放 + 加速前进 2 m/s²（期望：圆点向下，与竖握一致）")
    val out = run(rv, worldAccel = floatArrayOf(0f, 2f, 0f), yawRate = 0f, seconds = 1.5f)
    report(out)
    check("平放加速 → offsetYdp 为正（向下）", out.offsetYdp > 20f)
}

private fun scenarioNoiseRejection(rv: FloatArray) {
    println("\n[场景 7] 静止 + 传感器噪声 0.05 m/s²（期望：圆点不动）")
    val out = run(rv, worldAccel = floatArrayOf(0.05f, -0.05f, 0f), yawRate = 0.01f, seconds = 3f)
    report(out)
    check("噪声不驱动位移", kotlin.math.abs(out.offsetXdp) < 2f && kotlin.math.abs(out.offsetYdp) < 2f)
}

private fun scenarioAutoVisibility(rv: FloatArray) {
    println("\n[场景 8] 自动模式：静止 → 运动 → 再静止")

    val engine = MotionCueEngine()
    val fusion = SensorFusion()
    var t = 0L

    // 静止 3 秒
    repeat(150) {
        t += 20
        val f = fusion.update(null, null, floatArrayOf(0f, 0f, 0f), null, floatArrayOf(0f, 0f, 0f))
        engine.update(f, t)
    }
    val stillOutput = engine.currentOutput()
    println("        · 静止 3 秒后 alpha = ${fmt(stillOutput.alpha)}")
    check("静止时圆点隐藏", stillOutput.alpha < 0.01f)

    // 运动 2 秒
    repeat(100) {
        t += 20
        val f = fusion.update(rv, null, deviceFromWorld(rv, floatArrayOf(0f, 2f, 0f)), null, floatArrayOf(0f, 0f, 0f))
        engine.update(f, t)
    }
    val movingOutput = engine.currentOutput()
    println("        · 运动 2 秒后 alpha = ${fmt(movingOutput.alpha)}")
    check("检测到运动后淡入", movingOutput.alpha > 0.9f)

    // 静止 12 秒（超过 stillTimeoutS=10s）
    repeat(600) {
        t += 20
        val f = fusion.update(rv, null, floatArrayOf(0f, 0f, 0f), null, floatArrayOf(0f, 0f, 0f))
        engine.update(f, t)
    }
    val fadedOutput = engine.currentOutput()
    println("        · 再静止 12 秒后 alpha = ${fmt(fadedOutput.alpha)}")
    check("长时间静止后淡出", fadedOutput.alpha < 0.01f)
}

private fun scenarioGravityFallback(rv: FloatArray) {
    println("\n[场景 9] 无线性加速度传感器：加速度计 − 重力（竖握 + 加速 2 m/s²）")
    // 世界重力 = (0,0,-9.81)；设备测得的加速度计读数 = 线性加速度 + 重力
    val linearDevice = deviceFromWorld(rv, floatArrayOf(0f, 2f, 0f))
    val gravityDevice = deviceFromWorld(rv, floatArrayOf(0f, 0f, -9.81f))
    val accelDevice = floatArrayOf(
        linearDevice[0] + gravityDevice[0],
        linearDevice[1] + gravityDevice[1],
        linearDevice[2] + gravityDevice[2]
    )
    println("        · 加速度计读数 = [${fmt(accelDevice[0])}, ${fmt(accelDevice[1])}, ${fmt(accelDevice[2])}] m/s²")

    val fusion = SensorFusion()
    val engine = MotionCueEngine()
    var t = 0L
    repeat(75) {
        t += 20
        val f = fusion.update(rv, accelDevice, null, gravityDevice, floatArrayOf(0f, 0f, 0f))
        engine.update(f, t)
    }
    val out = engine.currentOutput()
    report(out)
    check("加速度计 − 重力 路径可识别前进加速（向下）", out.offsetYdp > 20f)
}

private fun scenarioHeadingEast() {
    println("\n[场景 11] 车头朝东（旋转矢量 = (0.5,-0.5,-0.5)，竖握 + 加速前进 2 m/s² 向东）")
    println("        期望：新实现仍能识别前进方向；旧实现读世界 Y 轴（北）≈ 0，完全无响应")
    val eastHeading = floatArrayOf(0.5f, -0.5f, -0.5f)
    val r = RotationMath.rotationVectorToMatrix(eastHeading)
    println("        · 设备 Z 轴（屏幕法线）在世界坐标系 = ${vec(RotationMath.column(r, 2))}（应为西）")

    val gyroDevice = deviceFromWorld(eastHeading, floatArrayOf(0f, 0f, 0f))
    check("车头朝东时设备 Z 轴陀螺仪仍为 0", kotlin.math.abs(gyroDevice[2]) < 0.05f)

    val out = run(eastHeading, worldAccel = floatArrayOf(2f, 0f, 0f), yawRate = 0f, seconds = 1.5f)
    report(out)
    check("车头朝东加速 → 圆点向下（offsetYdp > 20）", out.offsetYdp > 20f)
}

private fun scenarioLimits(rv: FloatArray) {    println("\n[场景 10] 极端输入（加速 8 m/s² + 偏航 1.5 rad/s）")
    val out = run(rv, worldAccel = floatArrayOf(-6f, 8f, 0f), yawRate = 1.5f, seconds = 2f)
    report(out)
    check("水平位移被限制在 ±40dp 内", kotlin.math.abs(out.offsetXdp) <= 40.01f)
    check("垂直位移被限制在 ±48dp 内", kotlin.math.abs(out.offsetYdp) <= 48.01f)
}

/**
 * 场景 12：倾斜姿态 + 只有加速度计（含重力），且中途 reset。
 *
 * 关键性质：世界坐标系里的重力是纯垂直向量，投影到水平面必然为 0，
 * 所以即使重力扣除失效（reset 后低通估计尚未重新播种），
 * 也不会把 9.8 m/s² 的重力漏进圆点位移。
 * 这条断言用来锁住「姿态再歪也不会因为重力而乱飘」这一行为。
 */
private fun scenarioTiltedGravityOnly() {
    println("\n[场景 12] 倾斜 45°+ 只有加速度计（含重力）+ 中途 reset（期望：圆点完全不动）")
    // 绕世界 X 轴（东）倾斜 45°：旋转矢量 = (sin22.5°, 0, 0)
    val tilted = floatArrayOf(0.3826834f, 0f, 0f)
    val gravityWorld = floatArrayOf(0f, 0f, -9.81f)
    val accelDevice = deviceFromWorld(tilted, gravityWorld)
    println("        · 设备加速度计读数 = ${vec(accelDevice)} m/s²（含全部重力）")

    val fusion = SensorFusion()
    val engine = MotionCueEngine()
    var t = 0L
    var worstX = 0f
    var worstY = 0f

    fun drive(frames: Int) {
        repeat(frames) {
            t += 20
            // linearAccel = null、gravity = null → 走加速度计低通估重力的兜底路径
            val f = fusion.update(tilted, accelDevice, null, null, floatArrayOf(0f, 0f, 0f))
            val out = engine.update(f, t)
            worstX = maxOf(worstX, kotlin.math.abs(out.offsetXdp))
            worstY = maxOf(worstY, kotlin.math.abs(out.offsetYdp))
        }
    }

    drive(150) // 3 秒
    fusion.reset()
    engine.reset()
    drive(50) // reset 后 1 秒（重力估计尚未重新播种的窗口）

    val out = engine.currentOutput()
    report(out)
    println("        · 全程最大 |offsetXdp|=${fmt(worstX)}, |offsetYdp|=${fmt(worstY)}")
    check("重力不会被当成车辆运动（水平方向不动）", worstX < 2f)
    check("重力不会被当成车辆运动（垂直方向不动）", worstY < 2f)
    check("纯重力姿态下自动模式保持隐藏", out.alpha < 0.01f)
}

// ---------------- 工具 ----------------

private fun run(
    rv: FloatArray,
    worldAccel: FloatArray,
    yawRate: Float,
    seconds: Float
): MotionCueEngine.CueOutput {
    val fusion = SensorFusion()
    val engine = MotionCueEngine()
    val gyroWorld = floatArrayOf(0f, 0f, yawRate)
    val linearDevice = deviceFromWorld(rv, worldAccel)
    val gyroDevice = deviceFromWorld(rv, gyroWorld)

    var t = 0L
    val steps = (seconds * 50).toInt()
    repeat(steps) {
        t += 20
        val f = fusion.update(rv, null, linearDevice, null, gyroDevice)
        engine.update(f, t)
    }
    return engine.currentOutput()
}

/** 世界向量 → 设备坐标系（world = R * device ⇒ device = Rᵀ * world） */
private fun deviceFromWorld(rv: FloatArray, world: FloatArray): FloatArray {
    val r = RotationMath.rotationVectorToMatrix(rv)
    val rt = floatArrayOf(
        r[0], r[3], r[6],
        r[1], r[4], r[7],
        r[2], r[5], r[8]
    )
    return RotationMath.rotate(rt, world)
}

private fun report(out: MotionCueEngine.CueOutput) {
    println(
        "        · 结果: offsetXdp=${fmt(out.offsetXdp)}, offsetYdp=${fmt(out.offsetYdp)}, " +
            "alpha=${fmt(out.alpha)}, magnitude=${fmt(out.magnitude01)}"
    )
}

private fun approx(a: FloatArray, b: FloatArray): Boolean =
    a.size == b.size && a.indices.all { kotlin.math.abs(a[it] - b[it]) < 0.01f }

private fun check(name: String, condition: Boolean) {
    if (condition) {
        println("        ✓ $name")
    } else {
        failures++
        println("        ✗ $name")
    }
}

private fun fmt(v: Float): String = String.format("%.2f", v)

private fun vec(v: FloatArray): String =
    "[${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])}]"