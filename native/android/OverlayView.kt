package com.anonymous.anticarsicknessrn

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View

/**
 * 悬浮窗自定义 View：屏幕左右两侧各绘制一列圆点（共 16 个），
 * 整组圆点按运动提示引擎的输出平移，模拟「车窗外景物掠过」的视觉效果。
 *
 * 对标 Apple Vehicle Motion Cues：
 * - 圆点固定在屏幕两侧边缘带内（不干扰中间内容）
 * - 白色圆点 + 深色描边，在亮/暗背景上都清晰（Apple 会自动调整对比度）
 * - 位移受限（水平 ≤ 40dp，垂直 ≤ 48dp），圆点始终停留在边缘
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
    private val maxOffsetXPx = dp(MAX_OFFSET_X_DP)
    private val maxOffsetYPx = dp(MAX_OFFSET_Y_DP)

    private var offsetX = 0f
    private var offsetY = 0f
    private var viewAlpha = 0f
    private var magnitude = 0f
    private var paused = false

    /** 息屏期间暂停重绘（由 OverlayManager 调用） */
    fun setPaused(paused: Boolean) {
        if (this.paused == paused) return
        this.paused = paused
        if (!paused) postInvalidateOnAnimation()
    }

    /** 由 OverlayManager 调用；位移单位 dp，alpha 与 magnitude01 范围 0~1 */
    fun setCue(offsetXdp: Float, offsetYdp: Float, alpha: Float, magnitude01: Float) {
        offsetX = (offsetXdp * density).coerceIn(-maxOffsetXPx, maxOffsetXPx)
        offsetY = (offsetYdp * density).coerceIn(-maxOffsetYPx, maxOffsetYPx)
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
        val radius = dotRadiusPx * (0.9f + 0.35f * magnitude)

        val topY = heightF * SPAN_START
        val bottomY = heightF * SPAN_END
        val spacing = (bottomY - topY) / (DOT_COUNT_PER_SIDE - 1)

        val leftX = (edgeInsetPx + offsetX).coerceIn(radius, bandMaxPx)
        val rightX = (widthF - edgeInsetPx + offsetX)
            .coerceIn(widthF - bandMaxPx, widthF - radius)

        for (i in 0 until DOT_COUNT_PER_SIDE) {
            val y = (topY + i * spacing + offsetY).coerceIn(radius, heightF - radius)
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
        /** 圆点半径（dp） */
        const val DOT_RADIUS_DP = 4.5f
        /** 静止位置距屏幕边缘的距离（dp） */
        const val EDGE_INSET_DP = 26f
        /** 圆点允许停留的最大边缘带宽度（dp），保证不侵入内容区 */
        const val BAND_MAX_DP = 56f
        const val MAX_OFFSET_X_DP = 40f
        const val MAX_OFFSET_Y_DP = 48f
        /** 圆点纵向分布范围（屏幕高度比例） */
        const val SPAN_START = 0.15f
        const val SPAN_END = 0.85f
        const val STROKE_COLOR = "#66000000"
    }
}