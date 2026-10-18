package com.anonymous.anticarsicknessrn

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import kotlin.math.max
import kotlin.math.min

/**
 * 悬浮窗自定义 View：屏幕左右两侧各绘制一列圆点（共 16 个），
 * 整组圆点按运动提示引擎的输出平移，模拟「车窗外景物掠过」的视觉效果。
 *
 * 对标 Apple Vehicle Motion Cues：
 * - 圆点固定在屏幕两侧边缘带内（不干扰中间内容）
 * - 白色圆点 + 深色描边，在亮/暗背景上都清晰（Apple 会自动调整对比度）
 * - 运动越强圆点略大，作为强度的第二通道
 *
 * 位移限幅的原则：**能走多远由几何决定，且左右两列共用同一个位移量**。
 * 之前 View 自己写死 ±40dp 再按 `[radius, BAND_MAX]` 逐列裁剪，
 * 结果左列能走 +30/-21.5dp、右列能走 +21.5/-30dp，
 * 大位移时两列撞墙位置不同，看起来不再是「整组平移」。
 * 引擎侧的满行程（[MotionCueEngine.CueConfig.maxOffsetXdp]）必须不超过这里的行程。
 */
class OverlayView(context: Context) : View(context) {

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.FILL
    }

    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor(STROKE_COLOR)
        style = Paint.Style.STROKE
        strokeWidth = dp(1f)
    }

    private val dotRadiusPx = dp(DOT_RADIUS_DP)
    private val edgeInsetPx = dp(EDGE_INSET_DP)
    private val bandMaxPx = dp(BAND_MAX_DP)

    private var offsetX = 0f
    private var offsetY = 0f
    private var viewAlpha = 0f
    private var magnitude = 0f
    private var paused = false

    /** 息屏期间暂停绘制（由 OverlayManager 调用） */
    fun setPaused(paused: Boolean) {
        if (this.paused == paused) return
        this.paused = paused
        if (!paused) postInvalidateOnAnimation()
    }

    /** 由 OverlayManager 调用；位移单位 dp，alpha 与 magnitude01 范围 0~1 */
    fun setCue(offsetXdp: Float, offsetYdp: Float, alpha: Float, magnitude01: Float) {
        offsetX = dp(offsetXdp)
        offsetY = dp(offsetYdp)
        viewAlpha = alpha.coerceIn(0f, 1f)
        magnitude = magnitude01.coerceIn(0f, 1f)
        if (!paused) postInvalidateOnAnimation()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (paused || viewAlpha <= 0.01f) return

        val widthF = width.toFloat()
        val heightF = height.toFloat()
        if (widthF <= 0f || heightF <= 0f) return

        val alphaInt = (255 * viewAlpha).toInt().coerceIn(0, 255)
        fillPaint.alpha = alphaInt
        strokePaint.alpha = alphaInt

        // 运动越强圆点略大，增强提示但保持克制
        val radius = dotRadiusPx *
            (RADIUS_MIN_SCALE + (RADIUS_MAX_SCALE - RADIUS_MIN_SCALE) * magnitude)

        val topY = heightF * SPAN_START
        val bottomY = heightF * SPAN_END
        if (bottomY <= topY) return
        val spacing = (bottomY - topY) / (DOT_COUNT_PER_SIDE - 1)

        // 横向：离边缘太近会出屏，太远会侵入内容区，取两边剩余量的较小值
        val maxShiftX = max(0f, min(edgeInsetPx - radius, bandMaxPx - edgeInsetPx))
        // 纵向：整组一起走，靠上下留白限幅；不做逐点裁剪，
        // 否则分屏/小窗时边缘的点会被「按住」，中间还在动，破坏平移一致性
        val maxShiftY = max(0f, min(topY - radius, heightF - bottomY - radius))

        val shiftX = offsetX.coerceIn(-maxShiftX, maxShiftX)
        val shiftY = offsetY.coerceIn(-maxShiftY, maxShiftY)

        val leftX = edgeInsetPx + shiftX
        val rightX = widthF - edgeInsetPx + shiftX

        for (i in 0 until DOT_COUNT_PER_SIDE) {
            val y = topY + i * spacing + shiftY
            canvas.drawCircle(leftX, y, radius, fillPaint)
            canvas.drawCircle(leftX, y, radius, strokePaint)
            canvas.drawCircle(rightX, y, radius, fillPaint)
            canvas.drawCircle(rightX, y, radius, strokePaint)
        }
    }

    private val density: Float
        get() = resources.displayMetrics.density

    private fun dp(value: Float): Float = value * density

    companion object {
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

        /** 圆点纵向分布范围（屏幕高度比例） */
        const val SPAN_START = 0.15f
        const val SPAN_END = 0.85f

        const val STROKE_COLOR = "#66000000"

        /**
         * 当前几何下横向实际可走的行程（dp）：
         * min(EDGE_INSET − 最大半径, BAND_MAX − EDGE_INSET) = min(26−5.625, 30) ≈ 20.4
         * 调整边缘带时，记得同步 [MotionCueEngine.CueConfig] 的 maxOffsetXdp。
         */
        const val MAX_SHIFT_X_DP = EDGE_INSET_DP - DOT_RADIUS_DP * RADIUS_MAX_SCALE
    }
}
