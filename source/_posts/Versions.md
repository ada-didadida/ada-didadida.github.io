---
title: 理清版本间的关系
date: 2024-01-25 11:12:36
tags:
  - - C#
  - - 翻译
categories:
  - - C#
  - - 翻译
top_img: /images/covers/versions.png
---

在开发领域，各要素存在着许多不同的版本。你要能够区分Visual Studio（集成开发环境）、C#（编程语言）和.NET（框架）的各个版本。尽管单独讨论这些元素而不涉及其他方面颇有挑战，但我会试着做到这一点... 另外，我在此不会讨论CLR（公共语言运行时）的版本，因为大部分开发者实际上不需要对此有深入了解。<!--more-->

## .NET 框架版本

.NET框架迄今为止已经发布了七个主要版本，这还不包括服务包。这个框架涵盖了编译器、运行时以及各种库。另外，还有像Silverlight这样的其他特定配置文件，这进一步增加了情况的复杂性。

  * 1.0 - 2002年发布
  * 1.1 - 2003年发布
  * 2.0 - 2005年发布，引入了新的公共语言运行时（CLR），用于支持泛型和可空类型，同时提供了C# 2和VB 8的编译器。
  * 3.0 - 2006年发布，实际上是在2.0的基础上增加了新的库，包括Windows Presentation Foundation、Windows Communication Foundation、Workflow Foundation和Cardspace。
  * 3.5 - 2007年发布，基于3.0，新增了一些库（主要是LINQ和一些额外的“基础”库，如`TimeZoneInfo`）和新编译器（用于C# 3和VB 9）。
  * 4 - 2010年发布，包含了全新的CLR（第4版）、新增的库和动态语言运行时（DLR）。
  * 4.5 - 2012年发布，支持在Windows 8上进行WinRT开发，并且扩展了更多的库——包括更广泛的异步API。

## C# 语言版本

有五个重要的语言版本：

  * C# 1
  * C# 2，引入泛型、可空类型、匿名方法、迭代器块和一些其他次要功能
  * C# 3，引入隐式类型定义、对象和集合的初始化器、匿名类型、自动属性、Lambda表达式、扩展方法、查询表达式等功能
  * C# 4，引入动态类型、可选参数、命名参数和泛型变体
  * C# 5，引入异步函数、调用者信息属性和对 `foreach` 迭代变量捕获方式的细微改进

 请查看Microsoft和ECMA为每个版本提供的规格说明页面([原文](https://csharpindepth.com/articles/Specifications) [译文](/2024/08/26/Specifications/))，以获取下载相关信息。

## Visual Studio 版本

长时间以来，Visual Studio的发布与.NET框架的发布紧密相连。不过，这种状况现在变得更加灵活和复杂了：

  * VS .NET 2002 - 支持 C# 1 和 .NET 1.0
  * VS .NET 2003 - 支持 C# 1 和 .NET 1.1
  * VS 2005 - 支持 C# 2 和 .NET 2.0，以及带有扩展的 .NET 3.0
  * VS 2008 - 支持 C# 3 和 .NET 2.0、3.0 和 3.5（多目标）
  * VS 2010 - 支持 C# 4 和 .NET 2.0、3.0、3.5 和 4
  * VS 2012 - 支持 C# 5 和 .NET 2.0 至 4.5（包括在 Windows 8 上的 WinRT 开发），以及便携式类库

这就是所有的理论基础。下面是实际的限制和工作配置。请注意，这里的假设您想要使用 Visual Studio——如果您愿意只使用命令行编译器，情况就会有所不同，在这里我就不做过多的介绍了。（在某个时候，我会回到这个页面，讨论 C# 4 和 C# 5 的特性，但现在还不是时候...）

  * 无法在低于VS 2005的版本中使用C# 2的特性
  * 在非VS 2008的版本中，你无法使用C# 3的特性
  * 不能让VS 2005或VS 2008面向 .NET 1.0或1.1（虽然有相应的扩展，但我未曾使用过——可以预见在调试等方面可能会有些痛苦）
  * 无法强制VS 2008仅使用C# 2的特性，也无法让VS 2005仅使用C# 1的特性
  * 每个版本的 Visual Studio 都有其自己的项目文件格式，当你首次在新版本中加载旧项目时，它会升级你的项目。（VS 2003 和 VS 2005 之间的差异很大；VS 2005 和 VS 2008 之间的差异则相对较小。）
  * VS 2008 在项目属性中特别支持您想要面向的框架版本：2.0、3.0 或 3.5
  * 面向 .NET 2.0或3.0时，你可以使用大多数C# 3的特性，但并非全部。

## 在 .NET 2.0 和 3.0 中使用 C# 3

在 .NET 2.0中，有些C# 3的特性可以直接使用；有些则需要进行一些额外的操作；还有一个特性是完全不支持的：

### 完全可用的特性

 自动实现的属性、隐式类型的本地变量和数组、对象和集合的初始化器、匿名类型、部分方法和Lambda表达式都可以随心所欲地使用。需要注意的是，在 .NET 2.0中，由于缺少 `Func<...>` 和 `Action<...>` 等委托类型族，Lambda表达式的实用性会有所降低，但这些类型可以在你自己的代码中轻松声明：

```csharp
public delegate void Action();
public delegate void Action<T1, T2>(T1 arg1, T2 arg2);
public delegate void Action<T1, T2, T3>(T1 arg1, T2 arg2, T3 arg3);
public delegate void Action<T1, T2, T3, T4>(T1 arg1, T2 arg2, T3 arg3, T4 arg4);
public delegate TResult Func<TResult>();
public delegate TResult Func<T, TResult>(T arg);
public delegate TResult Func<T1, T2, TResult>(T1 arg1, T2 arg2);
public delegate TResult Func<T1, T2, T3, TResult>(T1 arg1, T2 arg2, T3 arg3);
public delegate TResult Func<T1, T2, T3, T4, TResult>(T1 arg1, T2 arg2, T3 arg3, T4 arg4);
```

（请注意，.NET 2.0 包含了 `Action<T>`，因此上面没有列出。）

### 部分可用的特性 - 扩展方法和查询表达式

 扩展方法需要一个属性，这个属性通常是 .NET 3.5的一部分。不过，你可以自行定义这个属性，这样一来，你就可以尽情地编写和使用扩展方法了：

```csharp
namespace System.Runtime.CompilerServices
{
    [AttributeUsageAttribute(AttributeTargets.Assembly | AttributeTargets.Class | AttributeTargets.Method)]
    public class ExtensionAttribute : Attribute
    {
    }
}
```

 查询表达式本身不受框架版本影响，因为它们只是转换成“正常”的C# 3代码——但是，如果没有实现 `Select`、`Where` 等方法的相应功能，它们就不那么有用了。这些功能通常是 .NET 3.5的组成部分，但[LINQBridge](https://www.albahari.com/nutshell/linqbridge.aspx)提供了一个适用于 .NET 2.0的LINQ to Objects实现。这使得可以在进程内使用查询表达式进行查询。


### 不可用的特性 - 表达式树

 据我所知，在使用 .NET 2.0的情况下，没有办法让编译器创建表达式树，主要是因为所有相关的表达式树库类都是 .NET 3.5的组成部分。虽然可能有办法重新实现它们，正如LINQBridge对LINQ to Objects所做的那样，但我不建议你对此抱有太大希望——这会更加复杂。进一步地说，没有 .NET 3.5，你就无法使用“进程外”的LINQ，因为它依赖于表达式树。

希望这些解释能让整个情况更加明朗！如果你对这个主题还有更多问题，请给我[发邮件](mailto:skeet@pobox.com)。

> 本文是对[Untangling the Versions](https://csharpindepth.com/articles/Versions)这篇文章的翻译，作者是著有[C# in Depth](https://csharpindepth.com/)的大神[Jon Skeet](https://jonskeet.uk/)。非文章原文或本人对某段文字理解，会以斜体 *个人理解：xxx* 进行标注。本人翻译能力有限，强烈建议大家去看原版！
