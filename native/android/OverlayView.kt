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
 * - 运动越强圆点略大，作为强度的第二通道
 *
 * 位移限幅的原则：**能走多远由几何决定，且左右两列共用同一个位移量**。
 * 之前 View 自己写死 ±40dp 再按 `[radius, BAND_MAX]` 逐列裁剪，
 * 结果左列能走 +30/-21.5dp、右列能走 +21.5/-30dp，
 * 大位移时两列撞墙位置不同，看起来不再是「整组平移」。
 * 引擎侧的满行程（[MotionCueEngine.CueConfig.maxOffsetXdp]）必须不超过这里的行程。
 *
 * 本 View 只负责画：几何量（半径、行程、列位置）全部在 [OverlayGeometry] 里定义，
 * 那些「两列必须对称」「引擎满行程 ≤ 可走行程」的不变量由 `tools/verify` 断言守住，
 * 不再靠注释提醒。
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

    /** 引擎输出的位移（dp）与强度；换算成像素统一交给 OverlayGeometry */
    private var offsetXdp = 0f
    private var offsetYdp = 0f
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
        this.offsetXdp = offsetXdp
        this.offsetYdp = offsetYdp
        viewAlpha = alpha.coerceIn(0f, 1f)
        magnitude = magnitude01.coerceIn(0f, 1f)
        if (!paused) postInvalidateOnAnimation()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (paused || viewAlpha <= 0.01f) return

        if (!OverlayGeometry.compute(width.toFloat(), height.toFloat(), density, magnitude, offsetXdp, offsetYdp, layout)) {
            return
        }

        val alphaInt = (255 * viewAlpha).toInt().coerceIn(0, 255)
        fillPaint.alpha = alphaInt
        strokePaint.alpha = alphaInt

        val radius = layout.radius
        for (i in 0 until OverlayGeometry.DOT_COUNT_PER_SIDE) {
            val y = OverlayGeometry.dotY(i, layout)
            canvas.drawCircle(layout.leftX, y, radius, fillPaint)
            canvas.drawCircle(layout.leftX, y, radius, strokePaint)
            canvas.drawCircle(layout.rightX, y, radius, fillPaint)
            canvas.drawCircle(layout.rightX, y, radius, strokePaint)
        }
    }

    /** 每帧复用的排布结果，避免 60Hz 下持续分配 */
    private val layout = DotLayout()

    private val density: Float
        get() = resources.displayMetrics.density

    private fun dp(value: Float): Float = value * density

    companion object {
        /**
         * 描边颜色。几何量（半径 / 边缘带 / 行程 / 两列位置）只在 `OverlayGeometry` 里定义，
         * 这里**不再放别名**：别名会把公式冻结成快照，等于又造出第二处真源。
         */
        const val STROKE_COLOR = "#66000000"
    }
}
