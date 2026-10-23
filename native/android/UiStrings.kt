package com.anonymous.anticarsicknessrn

/**
 * 用户可见名称的唯一真源。
 *
 * 之前同一个功能有四个名字：桌面标签「防晕车助手」、入口「防晕圆点」、
 * 磁贴与通知「防晕车提示」、通知渠道「防晕车助手」—— 用户在通知栏看到的名字
 * 在 App 里根本找不到对应入口。现在：应用叫 APP_NAME，功能一律叫 FEATURE_NAME。
 *
 * JS 侧的对应常量在 src/theme/brand.ts，两边一起改。
 */
object UiStrings {
    /** 应用名（= app.json 的 android.applicationName，桌面标签） */
    const val APP_NAME = "防晕车助手"

    /** 功能名：磁贴标签、通知标题、通知渠道、界面入口都用它 */
    const val FEATURE_NAME = "防晕圆点"

    const val CHANNEL_NAME = FEATURE_NAME

    const val NOTIFICATION_TITLE = "$FEATURE_NAME 正在显示"
    const val NOTIFICATION_TEXT = "屏幕两侧的点会随车辆运动流动"

    const val TILE_LABEL = FEATURE_NAME
}
