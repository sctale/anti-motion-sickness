package com.anonymous.anticarsicknessrn

/**
 * 算法验证台（JVM 上运行，不需要真机）：
 * 用合成传感器数据驱动与 Android 层完全相同的 Kotlin 算法，
 * 校验圆点位移的方向语义、姿态自适应、死区、自动模式等关键行为。
 *
 * 世界坐标系：X 东、Y 北、Z 天；车辆朝北行驶，乘客面朝车头（北）。
 */

private val WORLD_UP = floatArrayOf(0f, 0f, 1f)

/**
 * 断言一律按 CueConfig 的默认值折算成比例，而不是写死 dp 数字：
 * 这样重新调参（增益、满行程）时验证台不会假失败，
 * 同时又能抓住「方向反了」「完全不动」「超出满行程」这类真实回归。
 */
private val CFG = MotionCueEngine.CueConfig()
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
    scenarioTurnDynamicRange(upright)
    scenarioAutoHysteresis(upright)
    scenarioSamplingPolicy()
    scenarioSamplingPolicyNoFlapping()
    scenarioSamplingKeepsAliveWhileVisible()
    scenarioOverlayGeometry()
    scenarioSensitivityAndLandscape()

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
    check("加速前进 → offsetYdp 为正（向下）", out.offsetYdp > 0.5f * CFG.maxOffsetYdp)
    check("加速前进 → 水平方向基本不动", kotlin.math.abs(out.offsetXdp) < 0.15f * CFG.maxOffsetXdp)
}

private fun scenarioUprightBrake(rv: FloatArray) {
    println("\n[场景 2] 竖握 + 刹车 2 m/s²（期望：圆点向上流动）")
    val out = run(rv, worldAccel = floatArrayOf(0f, -2f, 0f), yawRate = 0f, seconds = 1.5f)
    report(out)
    check("刹车 → offsetYdp 为负（向上）", out.offsetYdp < -0.5f * CFG.maxOffsetYdp)
}

private fun scenarioUprightTurnLeft(rv: FloatArray) {
    println("\n[场景 3] 竖握 + 左转（偏航 +0.4 rad/s，向心加速度朝西 1.5 m/s²）")
    println("        期望：圆点向右；旧实现仅取设备 Z 轴陀螺仪，此姿态下为 0（完全无响应）")
    val legacyGyroZ = deviceFromWorld(rv, floatArrayOf(0f, 0f, 0.4f))[2]
    println("        · 旧实现读到 gyroZ(设备) = ${fmt(legacyGyroZ)} rad/s")
    val out = run(rv, worldAccel = floatArrayOf(-1.5f, 0f, 0f), yawRate = 0.4f, seconds = 1.5f)
    report(out)
    check("左转 → offsetXdp 为正（向右）", out.offsetXdp > 0.5f * CFG.maxOffsetXdp)
    check("左转在竖握姿态下旧实现无响应（gyroZ≈0）", kotlin.math.abs(legacyGyroZ) < 0.05f)
}

private fun scenarioUprightTurnRight(rv: FloatArray) {
    println("\n[场景 4] 竖握 + 右转（偏航 -0.4 rad/s，向心加速度朝东 1.5 m/s²）")
    val out = run(rv, worldAccel = floatArrayOf(1.5f, 0f, 0f), yawRate = -0.4f, seconds = 1.5f)
    report(out)
    check("右转 → offsetXdp 为负（向左）", out.offsetXdp < -0.5f * CFG.maxOffsetXdp)
}

private fun scenarioFlatTurnLeft(rv: FloatArray) {
    println("\n[场景 5] 平放 + 左转（期望：圆点向右；旧实现在该姿态下可响应）")
    val legacyGyroZ = deviceFromWorld(rv, floatArrayOf(0f, 0f, 0.4f))[2]
    println("        · 旧实现读到 gyroZ(设备) = ${fmt(legacyGyroZ)} rad/s")
    val out = run(rv, worldAccel = floatArrayOf(-1.5f, 0f, 0f), yawRate = 0.4f, seconds = 1.5f)
    report(out)
    check("左转（平放） → offsetXdp 为正", out.offsetXdp > 0.5f * CFG.maxOffsetXdp)
    check("平放姿态下旧实现同样能读到 0.4", legacyGyroZ > 0.35f)
}

private fun scenarioFlatAccelerate(rv: FloatArray) {
    println("\n[场景 6] 平放 + 加速前进 2 m/s²（期望：圆点向下，与竖握一致）")
    val out = run(rv, worldAccel = floatArrayOf(0f, 2f, 0f), yawRate = 0f, seconds = 1.5f)
    report(out)
    check("平放加速 → offsetYdp 为正（向下）", out.offsetYdp > 0.5f * CFG.maxOffsetYdp)
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
    check("加速度计 − 重力 路径可识别前进加速（向下）", out.offsetYdp > 0.5f * CFG.maxOffsetYdp)
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
    check("车头朝东加速 → 圆点向下", out.offsetYdp > 0.5f * CFG.maxOffsetYdp)
}

private fun scenarioLimits(rv: FloatArray) {    println("\n[场景 10] 极端输入（加速 8 m/s² + 偏航 1.5 rad/s）")
    val out = run(rv, worldAccel = floatArrayOf(-6f, 8f, 0f), yawRate = 1.5f, seconds = 2f)
    report(out)
    check("水平位移被限制在满行程内", kotlin.math.abs(out.offsetXdp) <= CFG.maxOffsetXdp + 0.01f)
    check("垂直位移被限制在满行程内", kotlin.math.abs(out.offsetYdp) <= CFG.maxOffsetYdp + 0.01f)
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

/**
 * 场景 13：满行程动态范围（防饱和）。
 *
 * 老参数下偏航增益 110dp/(rad/s) + 横向增益 20dp/(m/s²) 两项直接相加，
 * 一个普通 2.5 m/s² 的转弯单靠横向加速度就能算出 50dp，
 * 于是缓转、正常转、急转在屏幕上都是「顶到钳位」——完全看不出差别。
 * 现在两路各自归一到满行程再按权重合成，必须看到单调差异且急转不满钳。
 */
private fun scenarioTurnDynamicRange(rv: FloatArray) {
    println("\n[场景 13] 转弯动态范围（缓转 / 正常 / 急转应能看出差别）")

    data class Sample(val label: String, val yaw: Float, val latMS2: Float)
    val samples = listOf(
        Sample("缓转（高速匝道）", 0.12f, 0.8f),
        Sample("正常转弯", 0.25f, 1.8f),
        Sample("急转（路口 90°）", 0.50f, 3.2f),
    )

    val results = samples.map { s ->
        // 左转：偏航为正，向心加速度指向左侧（世界 X 为西 → 取负）
        val out = run(rv, worldAccel = floatArrayOf(-s.latMS2, 0f, 0f), yawRate = s.yaw, seconds = 1.5f)
        println("        · ${s.label}: yaw=${fmt(s.yaw)} rad/s, aLat=${fmt(s.latMS2)} m/s² → offsetXdp=${fmt(out.offsetXdp)}")
        out.offsetXdp
    }

    val max = CFG.maxOffsetXdp
    check("缓转位移明显小于满行程", results[0] < 0.35f * max)
    check("正常转弯落在中段（既不是不动也不是顶满）", results[1] > 0.30f * max && results[1] < 0.75f * max)
    check("急转接近但未撞钳位", results[2] > 0.75f * max && results[2] <= max + 0.01f)
    check("位移随转弯强度单调增加", results[0] < results[1] && results[1] < results[2])
}

/**
 * 场景 14：自动模式迟滞。
 * - 短暂晃动（低于确认窗口）不应让圆点出现；
 * - 进入运动态后，匀速巡航的弱信号仍要维持显示（否则高速上圆点会忽隐忽现）；
 * - 真正停下来超过 stillTimeout 才淡出。
 */
private fun scenarioAutoHysteresis(rv: FloatArray) {
    println("\n[场景 14] 自动模式迟滞（短暂晃动不显示 / 巡航弱信号维持 / 停车才淡出）")

    val stillLinear = floatArrayOf(0f, 0f, 0f)

    fun step(fusion: SensorFusion, engine: MotionCueEngine, t: Long, accelWorld: FloatArray): Long {
        val ts = t + 20L
        val f = fusion.update(
            rv, null, deviceFromWorld(rv, accelWorld), null, floatArrayOf(0f, 0f, 0f)
        )
        engine.update(f, ts)
        return ts
    }

    // A. 300ms 晃动 + 1.2s 静止 → 不应出现
    val fusion = SensorFusion()
    val engine = MotionCueEngine()
    var t = 0L
    repeat(15) { t = step(fusion, engine, t, floatArrayOf(0f, 0.6f, 0f)) }
    repeat(60) { t = step(fusion, engine, t, stillLinear) }
    val afterJiggle = engine.currentOutput()
    println("        · 300ms 晃动后 alpha=${fmt(afterJiggle.alpha)}")
    check("短暂晃动不触发圆点（确认窗口生效）", afterJiggle.alpha < 0.05f)

    // B. 2s 明确运动 → 淡入
    repeat(100) { t = step(fusion, engine, t, floatArrayOf(0f, 2f, 0f)) }
    val afterMoving = engine.currentOutput()
    println("        · 2s 运动后 alpha=${fmt(afterMoving.alpha)}")
    check("持续运动后淡入", afterMoving.alpha > 0.9f)

    // C. 之后 5s 只剩 0.2 m/s²（高于退出阈值、低于进入阈值）→ 必须维持
    repeat(250) { t = step(fusion, engine, t, floatArrayOf(0f, 0.2f, 0f)) }
    val duringCruise = engine.currentOutput()
    println("        · 巡航弱信号 5s 后 alpha=${fmt(duringCruise.alpha)}")
    check("匀速巡航弱信号不会让圆点消失（迟滞生效）", duringCruise.alpha > 0.9f)

    // D. 彻底静止 12s（超过 stillTimeout）→ 淡出
    repeat(600) { t = step(fusion, engine, t, stillLinear) }
    val afterStill = engine.currentOutput()
    println("        · 静止 12s 后 alpha=${fmt(afterStill.alpha)}")
    check("真正停车后按时淡出", afterStill.alpha < 0.01f)
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

/**
 * 采样档位策略：常驻服务的耗电主要来自采样本身，静止必须降档、一动立刻回档。
 * 这些断言全部按 SamplingPolicy 的默认门限折算，改参数不会假失败。
 */
private fun scenarioSamplingPolicy() {
    println("    场景：静止降档 / 运动回档（采样强度策略）")
    val p = SamplingPolicy()
    val idle = p.motionThreshold - 0.03f
    val moving = p.motionThreshold + 0.10f

    // 冷启动第一帧就判档：没有「刚有运动」的计时基准会立刻误降到最省电档
    check("冷启动静止仍保持最高档", p.update(0L, idle) == SamplingLevel.HIGH)
    check("静止未到中级门限仍保持最高档",
        p.update(p.idleToMediumMs - 1L, idle) == SamplingLevel.HIGH)
    check("静止过中级门限降到 MEDIUM",
        p.update(p.idleToMediumMs, idle) == SamplingLevel.MEDIUM)
    check("继续静止降到 LOW", p.update(p.idleToLowMs, idle) == SamplingLevel.LOW)
    check("长时间静止维持 LOW 不再继续降",
        p.update(p.idleToLowMs * 10L, idle) == SamplingLevel.LOW)

    // 回到运动：立刻回最高档，且重新计时（不是「还要再静止 20s 才升」）
    check("出现运动立刻回到 HIGH", p.update(p.idleToLowMs * 10L + 1L, moving) == SamplingLevel.HIGH)
    check("回档后短暂静止不被降档",
        p.update(p.idleToLowMs * 10L + 1_000L, idle) == SamplingLevel.HIGH)
    check("刚好等于门限的运动强度算有运动",
        p.update(p.idleToLowMs * 10L + 2_000L, p.motionThreshold) == SamplingLevel.HIGH)

    // reset（息屏后重新注册）：恢复最高档并重新计时
    p.update(p.idleToLowMs * 20L, idle)
    p.reset()
    check("reset 后档位回到 HIGH", p.level == SamplingLevel.HIGH)
    check("reset 后静止重新计时",
        p.update(500_000L, idle) == SamplingLevel.HIGH)

    // 门限非法必须在构造时就失败，而不是运行时静默错位
    var rejected = false
    try {
        SamplingPolicy(idleToMediumMs = 120_000L, idleToLowMs = 20_000L)
    } catch (_: IllegalArgumentException) {
        rejected = true
    }
    check("门限倒置被构造时拒绝", rejected)
}

/** 抖动：一个「走走停停」的行车过程不能导致反复注销/重注册传感器 */
private fun scenarioSamplingPolicyNoFlapping() {
    println("    场景：档位切换不抖动（每次切换都要重新注册传感器）")
    val p = SamplingPolicy()
    val idle = p.motionThreshold - 0.03f
    val moving = p.motionThreshold + 0.10f

    val frameMs = 250L
    val burstEveryFrames = 120L // 每 30s 动一下，模拟等红灯后起步
    val totalFrames = 960       // 共 4 分钟

    var switches = 0
    var downgraded = false
    var previous = p.update(0L, moving)
    for (step in 1..totalFrames) {
        val isBurst = step % burstEveryFrames == 0L
        val next = p.update(step * frameMs, if (isBurst) moving else idle)
        if (next != previous) {
            switches++
            previous = next
        }
        if (next != SamplingLevel.HIGH) downgraded = true
    }

    // 每个「静止 30s + 动一下」最多产生 2 次切换（降一档 + 回最高档）。
    // 如果实现改成「每帧都可能换」，这里会变成上千次，等于把传感器反复注销重注册。
    check("4 分钟内切换次数有界（≤ 2 × 起步次数 + 1）",
        switches <= 2 * (totalFrames / burstEveryFrames) + 1)
    check("确实会因长时间静止降档（不是永远最高档）", downgraded)
    check("起步后回到 HIGH", previous == SamplingLevel.HIGH)
}

/** 圆点正在显示时不得降档（自动模式的淡出窗口、巡航弱信号都属此情形） */
private fun scenarioSamplingKeepsAliveWhileVisible() {
    println("    场景：圆点显示中不降档（跟手性优先于省电）")
    val p = SamplingPolicy()
    val idle = p.motionThreshold - 0.03f

    p.update(0L, idle)
    check("强度低于门限且圆点未显示时按时间降档",
        p.update(p.idleToLowMs, idle, cueVisible = false) == SamplingLevel.LOW)
    check("圆点仍在显示时不降档",
        p.update(p.idleToLowMs + 60_000L, idle, cueVisible = true) == SamplingLevel.HIGH)
    check("显示中的一次刷新会重置静止计时",
        p.update(p.idleToLowMs + 61_000L, idle, cueVisible = false) == SamplingLevel.HIGH)
}

/**
 * 悬浮窗排布的几何不变量。
 *
 * 这些量以前同时写在 OverlayView 和 MotionCueEngine 两处，靠注释提醒同步，
 * 真的出过「左列 +30/-21.5、右列 +21.5/-30」的不对称裁剪。
 */
private fun scenarioOverlayGeometry() {
    println("    场景：边缘带几何与引擎满行程的一致性")
    val density = 3f
    val widthPx = 360f * density
    val heightPx = 800f * density
    val edgeInsetPx = OverlayGeometry.EDGE_INSET_DP * density
    val bandMaxPx = OverlayGeometry.BAND_MAX_DP * density
    val out = DotLayout()

    // 跨模块不变量：引擎走满行程时，View 必须真的能走那么远（否则被静默裁掉）
    check(
        "引擎横向满行程 ≤ 几何可走行程",
        CFG.maxOffsetXdp <= OverlayGeometry.MAX_SHIFT_X_DP + 1e-4f
    )
    check("几何可走行程由公式给出（≈20.375dp）",
        kotlin.math.abs(OverlayGeometry.MAX_SHIFT_X_DP - 20.375f) < 0.01f)

    // 满强度 + 满行程：这是最容易出界的组合
    val ok = OverlayGeometry.compute(
        widthPx, heightPx, density, 1f, CFG.maxOffsetXdp, CFG.maxOffsetYdp, out
    )
    check("常规手机尺寸排布可用", ok)
    val maxRadius = OverlayGeometry.DOT_RADIUS_DP * OverlayGeometry.RADIUS_MAX_SCALE * density
    check("满强度时的钳位行程与 MAX_SHIFT_X_DP 一致",
        kotlin.math.abs(OverlayGeometry.maxShiftX(maxRadius, edgeInsetPx, bandMaxPx) -
            OverlayGeometry.MAX_SHIFT_X_DP * density) < 0.01f)
    check("右行到极限仍未侵入内容区", out.leftX + out.radius <= bandMaxPx + 0.01f)
    check("左行到极限仍不出屏",
        OverlayGeometry.compute(widthPx, heightPx, density, 1f, -CFG.maxOffsetXdp, 0f, out) &&
            out.leftX - out.radius >= -0.01f)
    check("右行到极限右列仍不出屏",
        OverlayGeometry.compute(widthPx, heightPx, density, 1f, CFG.maxOffsetXdp, 0f, out) &&
            out.rightX + out.radius <= widthPx + 0.01f)

    // 平移一致性：两列间距恒等于 width − 2×edgeInset，与位移无关
    val gapBase = widthPx - 2f * edgeInsetPx
    var gapStable = true
    for (offsetDp in floatArrayOf(-40f, -CFG.maxOffsetXdp, 0f, CFG.maxOffsetXdp, 40f)) {
        OverlayGeometry.compute(widthPx, heightPx, density, 0.5f, offsetDp, 0f, out)
        if (kotlin.math.abs((out.rightX - out.leftX) - gapBase) > 0.01f) gapStable = false
        if (kotlin.math.abs(out.leftX - (edgeInsetPx + out.shiftX)) > 0.01f) gapStable = false
    }
    check("两列共用同一个位移量（间距不随位移变化）", gapStable)

    // 超行程输入必须被钳位，而不是穿出边缘带
    OverlayGeometry.compute(widthPx, heightPx, density, 1f, 400f, 0f, out)
    check("远超行程的输入被钳在几何上限",
        kotlin.math.abs(out.shiftX - OverlayGeometry.MAX_SHIFT_X_DP * density) < 0.01f)

    // 纵向：整组平移，最下个点在向下极限处仍贴边不出屏
    OverlayGeometry.compute(widthPx, heightPx, density, 1f, 0f, CFG.maxOffsetYdp, out)
    val lowestY = OverlayGeometry.dotY(OverlayGeometry.DOT_COUNT_PER_SIDE - 1, out)
    check("向下走满仍不出下边缘", lowestY + out.radius <= heightPx + 0.01f)
    OverlayGeometry.compute(widthPx, heightPx, density, 1f, 0f, -CFG.maxOffsetYdp, out)
    check("向上走满最上面的点仍在上边内",
        OverlayGeometry.dotY(0, out) - out.radius >= -0.01f)

    // 半径只作为强度的第二通道：单调、且在标定倍率内
    val r0 = OverlayGeometry.radiusFor(0f, maxRadius / OverlayGeometry.RADIUS_MAX_SCALE)
    val rMid = OverlayGeometry.radiusFor(0.5f, maxRadius / OverlayGeometry.RADIUS_MAX_SCALE)
    val r1 = OverlayGeometry.radiusFor(1f, maxRadius / OverlayGeometry.RADIUS_MAX_SCALE)
    check("半径随强度单调增加", r0 < rMid && rMid < r1)
    check("强度 0 / 满对应标定的倍率",
        kotlin.math.abs(r0 / (maxRadius / OverlayGeometry.RADIUS_MAX_SCALE) -
            OverlayGeometry.RADIUS_MIN_SCALE) < 0.01f &&
            kotlin.math.abs(r1 / (maxRadius / OverlayGeometry.RADIUS_MAX_SCALE) -
                OverlayGeometry.RADIUS_MAX_SCALE) < 0.01f)

    // 退化输入不能画到屏幕外
    check("窗口尚未量出尺寸时不排布",
        !OverlayGeometry.compute(0f, heightPx, density, 1f, 10f, 10f, DotLayout()))
    check("分屏窄到放不下边缘带时不排布（而不是画到中间）",
        !OverlayGeometry.compute(2f * edgeInsetPx, heightPx, density, 1f, 10f, 10f, DotLayout()))
    val narrow = DotLayout()
    OverlayGeometry.compute(edgeInsetPx * 2.2f, heightPx, density, 1f, 20f, 0f, narrow)
    check("窄窗口下仍按同一行程钳位（不因宽度变化而越界）",
        narrow.shiftX <= OverlayGeometry.MAX_SHIFT_X_DP * density + 0.01f)
    check("边缘带不够时行程被压到 0 而不是变负",
        OverlayGeometry.maxShiftX(edgeInsetPx + 1f, edgeInsetPx, bandMaxPx) == 0f)
}

/**
 * 场景：灵敏度档位与横屏排布。
 *
 * 灵敏度只允许缩放「满行程参考输入」，不允许放大满行程本身（AGENTS 红线 7）；
 * 同时档位必须单调 —— 加了「极高」档之后，这条比原来更值得钉住。
 */
private fun scenarioSensitivityAndLandscape() {
    println("    场景：灵敏度档位（含极高）与横屏排布")
    val upright = floatArrayOf(0.70710678f, 0f, 0f)
    // 一个「不到满行程」的中等输入：横向 1.6 m/s² + 偏航 0.22 rad/s
    val accel = floatArrayOf(0f, 1.6f, 0f)
    val yaw = 0.22f

    fun driveAt(sensitivity: Float): Float {
        val fusion = SensorFusion()
        val engine = MotionCueEngine(
            MotionCueEngine.CueConfig().withSensitivity(sensitivity)
        )
        val gyroWorld = floatArrayOf(0f, 0f, yaw)
        val linearDevice = deviceFromWorld(upright, accel)
        val gyroDevice = deviceFromWorld(upright, gyroWorld)
        var t = 0L
        repeat(100) {
            t += 20
            engine.update(fusion.update(upright, null, linearDevice, null, gyroDevice), t)
        }
        return engine.currentOutput().offsetXdp
    }

    val low = kotlin.math.abs(driveAt(0.7f))
    val medium = kotlin.math.abs(driveAt(1.0f))
    val high = kotlin.math.abs(driveAt(1.4f))
    val veryHigh = kotlin.math.abs(driveAt(1.8f))
    check("同一输入下位移随档位单调增加", low < medium && medium < high && high < veryHigh)
    check("极高档仍未越过横向满行程", veryHigh <= CFG.maxOffsetXdp + 0.01f)
    check("灵敏度不放大满行程本身（红线 7）",
        MotionCueEngine.CueConfig().withSensitivity(1.8f).maxOffsetXdp == CFG.maxOffsetXdp &&
        MotionCueEngine.CueConfig().withSensitivity(1.8f).maxOffsetYdp == CFG.maxOffsetYdp)
    check("极高档的参考输入仍为正数",
        MotionCueEngine.CueConfig().withSensitivity(1.8f).yawReferenceRadS > 0f)

    // 横屏：宽 > 高，纵向分布要放宽，否则 8 个点挤成一坨
    val portrait = OverlayGeometry.spanFor(1080f, 2400f)
    val landscape = OverlayGeometry.spanFor(2400f, 1080f)
    check("横屏分布区间比竖屏更宽",
        landscape.first < portrait.first && landscape.second > portrait.second)
    val layout = DotLayout()
    val okLand = OverlayGeometry.compute(2400f, 1080f, 3f, 1f, CFG.maxOffsetXdp, CFG.maxOffsetYdp, layout)
    val lowest = OverlayGeometry.dotY(OverlayGeometry.DOT_COUNT_PER_SIDE - 1, layout)
    val highest = OverlayGeometry.dotY(0, layout)
    check("横屏排布可用且两列仍贴左右边", okLand &&
        kotlin.math.abs(layout.rightX - layout.leftX - (2400f - 2f * OverlayGeometry.EDGE_INSET_DP * 3f)) < 0.01f)
    check("横屏走满仍不上下出屏", lowest + layout.radius <= 1080f + 0.01f && highest - layout.radius >= -0.01f)
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