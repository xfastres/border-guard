# v0.19 Layout and Gestures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 按参考图交付地图主体、角落HUD与互斥移动手势。
**Architecture:** 原生单HTML，共用原业务函数；整理样式与单一触摸手势状态，使用滚动容器平移地图。
**Tech Stack:** HTML/CSS/Canvas/Pointer Events，Node+Chrome无依赖验证。
**Spec:** docs/superpowers/specs/2026-11-13-v019-layout-gestures.md

## Global Constraints
- 保留v0.17/v0.18；独立Border-Guard-v0.19.html，不增加依赖、不发布。
- 长按350ms，拖动阈值10px，按钮最小44px。
- 数据实际记录，不照抄图片中的旧文案。

## Review Focus
- 手机横屏宽于720px仍识别触摸UI。
- 多指/cancel/失焦不留下延迟建造或双click。
- 拖动地图不移动领主、不扣建造资源。
- 卡片与弹窗有界，地图不被浮层挤压。
- 胜利保留顶部HUD与左右底角卡，地图只读且重开恢复。

### Task 1: 布局
- [ ] 在v0.18观察多尺寸失败，再整理重复布局CSS，生成v0.19。
- [ ] 保留顶部HUD、全画幅地图、底角战报与目标；触摸抽屉与遮罩。
- [ ] 多尺寸截图与几何断言。

### Task 2: 互斥手势
- [ ] 先写短按/350ms长按/拖动/cancel/兼容click与建造模式回归。
- [ ] 实现共用Pointer状态与明确建造入口，下滑/遮罩关闭。
- [ ] 运行玩法、触屏与鼠标测试。

### Task 3: 验证与交付
- [ ] 独立代码审查，修正重要问题。
- [ ] 胜利页面和桌面/手机截图复核，保存测试证据与更新说明。
