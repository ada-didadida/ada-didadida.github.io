---
title: Markdown功能记录
date: 2021-01-06 16:25:00
reward_settings:
  enable: false
categories:
 - Markdown
tags: 
 - Markdown
---
### 标题
# 一级标题  
## 二级标题
### 三级标题
---
### 引用

> 该行内容为引用
>> 该行内容为引用
>>> 该行内容为引用
 <!-- more -->
---
### 代码块

` this is a code `

```C++
include "test.h"
if(true)
{
    std::cout << "hello world" << std::endl;
}
```

{% codeblock 这是标题 lang:language http://www.baidu.com 百度 line_number:false %}
code snippet
code snippet
code snippet
{% endcodeblock %}

{% codeblock 这是一段C++代码 lang:cpp http://www.cplusplus.com/ C++ %}
include "test.h"
if(true)
{
    std::cout << "hello world" << std::endl;
}
{% endcodeblock %}

{% codeblock 这是一段OC代码 lang:objc %}
[rectangle setX: 10 y: 10 width: 20 height: 20];
{% endcodeblock %}

---
### 复选框
- [ ] this is a task
- [x] this is a finished task
---
### 列表
- item1
- item2
- item3
- item6
   - item7
---
### 表格
First Header | Second Header
------------ | -------------
cell 1       | cell 2
balabala     | lalalalal

---
### 字体
*斜体*
**粗体**
***斜体粗体***
~~删除线~~
++Inserted text++
==mark==
<font color=red size=5>红色</font>
<font color=gray size=10>灰色</font>
H~2~0
29^th^
$\frac{1}{3}$
$\sum^{x \to \infty}_{y \to 0}{\frac{x}{y}}$
$\overline{xyz}$
$\sqrt x$
$\sqrt[3]{x+y}$
$\lim^{x \to \infty}_{y \to 0}{\frac{x}{y}}$
$\displaystyle \lim^{x \to \infty}_{y \to 0}{\frac{x}{y}}$

---
### 图片
> 本地相对路径图片 

![example](/image/example.jpg)

> Hexo标签插件图片

{% img /image/example.jpg This is an example image %}

> 网络图片

![example](https://octodex.github.com/images/dojocat.jpg)

---

### 链接
[百度](https://www.baidu.com)

### 注脚
Here is a footnote reference,[^1] and another.[^longnote]
[^1]: Here is the footnote.
[^longnote]: Here's one with multiple blocks.
    Subsequent paragraphs are indented to show that they
    belong to the previous footnote.

### emoji
:smile:
:pig:

### 鼠标悬浮标注（缩写）
*[HTML]: Hyper Text Markup Language
*[W3C]:  World Wide Web Consortium
The HTML specification
is maintained by the W3C.

### block
{% blockquote [author[, source]] [link] [source_link_title] %}
content
{% endblockquote %}

{% blockquote David Levithan, Wide Awake %}
Do not just seek happiness for yourself. Seek happiness for all. Through kindness. Through mercy.
{% endblockquote %}