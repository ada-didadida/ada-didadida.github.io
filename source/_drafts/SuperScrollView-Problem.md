---
title: SuperScrollView问题记录
date: 2024-02-02 10:53:44
tags:
  - - 问题记录
  - - Unity
---

- SuperScrollView动画计算时，使用了Mathf.SmoothDamp，当currentVal和targetVal都为0时，有概率会使该接口返回的currentVelocity变为NaN，导致后续所有计算错误
- SuperScrollView初始化时，会计算Content和ViewPort位置，如果它的父节点有Layout布局组件，会导致计算错误，所以如果父节点有Layout，初始化就必须等待一帧