package com.anonymous.anticarsicknessrn

/**
 * 圆点排布的纯几何（零 Android 依赖，可在 `tools/verify` 的 JVM 验证台上断言）。
 *
 * 为什么要单独抽出来：这个文件里的量曾经同时写在 `OverlayView` 和
 * `MotionCueEngine.CueConfig` 两处，靠注释提醒「记得同步」，
 * 结果真的出现过左列能走 +30/-21.5dp、右列 +21.5/-30dp 的不对称裁剪
 * —— 两列不再是「整组平移」，看起来就像画坏了。现在这些不变量由断言守着。
 *
 * 所有长度单位：`*Px` 是像素，`*Dp` 是 dp；换算只在 [compute] 里做一次。
 */
object OverlayGeometry {

    /** 每侧圆点数量（左右各 8，共 16） */
    const val DOT_COUNT_PER_SIDE = 8

    /** 圆点基准半径（dp） */
    const val DOT_RADIUS_DP = 4.5f

    /** 静止位置距屏幕边缘的距离（dp） */
    const val EDGE_INSET_DP = 26f

    /** 圆点允许停留的最大边缘带宽度（dp），保证不侵入内容区 */
    const val BAND_MAX_DP = 56f

    /** 强度为 0 / 满时的半径倍率 */
    const val RADIUS_MIN_SCALE = 0.9f
    const val RADIUS_MAX_SCALE = 1.25f

    /** 圆点纵向分布范围（屏幕高度比例，竖屏） */
    const val SPAN_START = 0.15f
    const val SPAN_END = 0.85f

    /** 横屏时屏幕高度只有竖屏的三分之一上下，收窄的留白会让 8 个点挤成一坨 */
    const val SPAN_START_LANDSCAPE = 0.10f
    const val SPAN_END_LANDSCAPE = 0.90f

    /** 按当前朝向取纵向分布区间（宽 > 高 即横屏） */
    fun spanFor(widthPx: Float, heightPx: Float): Pair<Float, Float> =
        if (widthPx > heightPx) {
            SPAN_START_LANDSCAPE to SPAN_END_LANDSCAPE
        } else {
            SPAN_START to SPAN_END
        }

    /**
     * 当前几何下横向实际可走的行程（dp）：
     * `min(EDGE_INSET − 最大半径, BAND_MAX − EDGE_INSET) = min(26−5.625, 30) ≈ 20.375`。
     *
     * 这里必须是**公式**而不是手写的数字，否则改边缘带时又会出现
     * 「注释说 20.4、实际能走 30」的漂移；引擎侧的满行程由断言
     * `CueConfig.maxOffsetXdp <= MAX_SHIFT_X_DP` 兜住。
     */
    val MAX_SHIFT_X_DP: Float
        get() = EDGE_INSET_DP - DOT_RADIUS_DP * RADIUS_MAX_SCALE

    /** 强度越大圆点略大（保持克制，只作为强度的第二通道） */
    fun radiusFor(magnitude01: Float, baseRadiusPx: Float): Float {
        val m = magnitude01.coerceIn(0f, 1f)
        return baseRadiusPx * (RADIUS_MIN_SCALE + (RADIUS_MAX_SCALE - RADIUS_MIN_SCALE) * m)
    }

    /** 横向行程：离边缘太近会出屏，太远会侵入内容区，取两边剩余量的较小值 */
    fun maxShiftX(radiusPx: Float, edgeInsetPx: Float, bandMaxPx: Float): Float =
        maxOf(0f, minOf(edgeInsetPx - radiusPx, bandMaxPx - edgeInsetPx))

    /** 纵向行程：整组一起走，靠上下留白限幅，不做逐点裁剪 */
    fun maxShiftY(
        topPx: Float,
        bottomPx: Float,
        heightPx: Float,
        radiusPx: Float
    ): Float = maxOf(0f, minOf(topPx - radiusPx, heightPx - bottomPx - radiusPx))

    /**
     * 计算一帧的全部排布量，写进调用方复用的 [out]（避免每帧分配）。
     *
     * @return false 表示当前尺寸不可用（窗口还没量出大小，或边缘带窄到放不下圆点）
     */
    fun compute(
        widthPx: Float,
        heightPx: Float,
        density: Float,
        magnitude01: Float,
        offsetXDp: Float,
        offsetYDp: Float,
        out: DotLayout
    ): Boolean {
        if (widthPx <= 0f || heightPx <= 0f || density <= 0f) return false

        out.radius = radiusFor(magnitude01, DOT_RADIUS_DP * density)
        val edgeInsetPx = EDGE_INSET_DP * density
        val bandMaxPx = BAND_MAX_DP * density

        val (spanStart, spanEnd) = spanFor(widthPx, heightPx)
        val topY = heightPx * spanStart
        val bottomY = heightPx * spanEnd
        if (bottomY <= topY || edgeInsetPx * 2f >= widthPx) return false

        out.topY = topY
        out.spacing = (bottomY - topY) / (DOT_COUNT_PER_SIDE - 1)

        // 位移钳位：左右两列共用同一个 shiftX，所以两列间距恒等于 width − 2*edgeInset
        val shiftLimitX = maxShiftX(out.radius, edgeInsetPx, bandMaxPx)
        val shiftLimitY = maxShiftY(topY, bottomY, heightPx, out.radius)
        out.shiftX = (offsetXDp * density).coerceIn(-shiftLimitX, shiftLimitX)
        out.shiftY = (offsetYDp * density).coerceIn(-shiftLimitY, shiftLimitY)

        out.leftX = edgeInsetPx + out.shiftX
        out.rightX = widthPx - edgeInsetPx + out.shiftX
        return true
    }

    /** 第 [index] 个圆点的纵向中心（整组平移，不逐点裁剪） */
    fun dotY(index: Int, layout: DotLayout): Float = layout.topY + index * layout.spacing + layout.shiftY
}

/** [OverlayGeometry.compute] 的写出目标；由 `OverlayView` 持有一份复用 */
class DotLayout {
    var radius = 0f
    var topY = 0f
    var spacing = 0f
    var shiftX = 0f
    var shiftY = 0f
    var leftX = 0f
    var rightX = 0f
}
