---
title: 动态求和一个序列
date: 2026-11-17 12:05:00
tags:
  - - C#
  - - dynamic
  - - LINQ
  - - 翻译
categories:
  - - C#
  - - 翻译
top_img: /images/covers/dynamic-sum.png
---

在书的一份早期草稿里，演示如何只在托管代码中使用动态类型的那一节，大部分篇幅都花在了"动态求和一个序列"这个任务上。后来语言的行为发生了变化，我不得不重写那一节，把例子改得更宽泛一些，但动态求和这个任务本身仍然足够有趣，值得记录下来。本文会讨论其中*一部分*可行的做法。为了让没有这本书的读者也能看懂，我会从零讲起，而不是接着书里的内容往下写。（这也意味着，如果书里有哪个地方你没看明白，这个页面或许能提供一种不同的解释，让你一下子"开窍"。）<!--more-->

## 我们想要达成什么？

LINQ to Objects 里的 [`Enumerable.Sum`](https://docs.microsoft.com/en-us/dotnet/api/system.linq.enumerable.sum) 有一大堆重载——可即便如此，它也不是什么都能处理。比如我们可能想对 `TimeSpan` 值求和——或者短整型，或者无符号整数——但这些场景框架里都没有提供。我们来看看能不能做得更好。如果能写出一个静态类型的泛型方案，用类似"该类型必须有一个 `public static T operator +(T, T)` 运算符"这样的约束来表达，那该多好，可惜没有这个选项。那就改用动态类型吧。

### 选择签名：先试试 `IEnumerable<dynamic>`

我们首先要决定的是 `DynamicSum` 方法该用什么签名。一种选择是用 `IEnumerable<dynamic>` 作参数，返回值也是 `dynamic`。你可能觉得这挺容易的，但它有两个明显的问题：

-   我们最常想求和的元素类型是值类型——而泛型变体不适用于值类型，所以我们没法从（比如说）`IEnumerable<int>` 转换成 `IEnumerable<dynamic>`。我们得写成 `values.Select(x => (dynamic) x).Sum()` 这种不太好看的东西，或者从一开始就用 `dynamic` 构建一个集合。
-   没有一个天然的"零"值。如果序列里至少有一个值，那还好办；但如果没有呢，该返回什么？整数 0？double 的 0.0？decimal 的 0.0m？还是一个 null 引用？当然，我们也可以把零值作为另一个参数传进来……但这也挺烦人的。

为了展示代码大概长什么样，我们就把零值作为另一个参数吧。另一种选择是像 `Max` 等方法那样，在序列为空时抛异常。下面是实现：

```C#
public static class DynamicExtensions
{
    public static dynamic DynamicSum(this IEnumerable<dynamic> source, dynamic zero)
    {
        dynamic total = zero;
        foreach (var item in source)
        {
            total = total + item;
        }
        return total;
    }
}
```

这看起来已经简单到不能再简单了——尽管我们后面会遇到的许多边角情况在这里同样适用。我们来试一试：

```C#
public class Test
{
    public static void Main()
    {
        TimeSpan oneHour = TimeSpan.FromHours(1);
        TimeSpan tenMinutes = TimeSpan.FromMinutes(10);
        TimeSpan threeSeconds = TimeSpan.FromSeconds(3);
        
        dynamic[] values = new dynamic[] { oneHour, tenMinutes, threeSeconds};
        dynamic timeSpanSum = values.DynamicSum(TimeSpan.Zero);
        Console.WriteLine("Sum with 'zero' as time span: {0}", timeSpanSum);
        
        DateTime now = DateTime.Now;
        Console.WriteLine("Current date/time: {0}", now);
        dynamic dateTimeSum = values.DynamicSum(now);
        Console.WriteLine("Sum with 'zero' as date/time: {0}", dateTimeSum);
    }
}
```

这里第一次我们用的是相当自然的"零"值——`TimeSpan.Zero`。第二次调用时，我们传的是当前日期时间。这对你或我来说也许不像个"零"，但对这个方法来说足够了——它很乐意把 `TimeSpan` 值加到 `DateTime` 值上，每一步的返回值都是一个新的 `DateTime`。下面是一次运行的结果：

```
Sum with 'zero' as time span: 01:10:03
Current date/time: 04/11/2010 07:39:24
Sum with 'zero' as date/time: 04/11/2010 08:49:27
```

`IEnumerable<dynamic>` 这条路我就走到这儿。现在换个思路。

### 动态地对一个静态类型序列求和

好，那我们把自己限制在更常见的那种需求上：对同一类型（或至少是兼容类型）的值求和。这样我们就可以对字节数组、`List<TimeSpan>` 之类的东西求和了。

我们还是有"用什么当零点"这个棘手的问题，但至少现在我们知道源类型和结果类型了，可以取该类型的默认值。这确实有一些缺点，我们后面会看到，但先保持简单。

```C#
public static T DynamicSum<T>(this IEnumerable<T> source)
{
    T total = default(T);
    foreach (dynamic item in source)
    {
        total = total + item;
    }
    return total;
}
```

这和我们之前的代码*几乎*一样，只是原来写 `dynamic` 的地方大多换成了 `T`。事实上，`dynamic` 只在一个地方出现：`item` 的声明。

遗憾的是，这段代码并不完全正确。如果你传给它一个字节数组，它会在执行时抛出这个错误：

```
Unhandled Exception: Microsoft.CSharp.RuntimeBinder.RuntimeBinderException:
   Cannot implicitly convert type 'int' to 'byte'.
   An explicit conversion exists (are you missing a cast?)
   at CallSite.Target(Closure , CallSite , Object )
   at System.Dynamic.UpdateDelegates.UpdateAndExecute1[T0,TRet](CallSite site, T0 arg0)
   at DynamicExtensions.DynamicSum[T](IEnumerable`1 source)
   at Test.Main()
```

问题出在这一行：

```C#
total = total + item;
```

赋值运算符右侧表达式的类型是 `dynamic`，因为它是动态加法的结果。然后我们试图把它赋回 `total`。而当我们把两个字节相加时，结果是 `int`——并且不存在从 `int` 到 `byte` 的隐式转换。不过存在显式转换，所以我们只要把这个转换写上，就能绕过问题：（*个人理解：原文这句写的是“从 `byte` 到 `int`”，但那其实是有隐式转换的；结合上下文和下面那个报错，作者想说的应该是从 `int` 到 `byte`。*）

```C#
public static T DynamicSum<T>(this IEnumerable<T> source)
{
    T total = default(T);
    foreach (dynamic item in source)
    {
        total = (T) (total + item);
    }
    return total;
}
```

注意，如果是在一个静态类型的方法里对字节数组求和，你也得做完全相同的事情……除非你用了这样的写法：

```C#
total += item;
```

C# 规范明确地把这种复合赋值表达式翻译成带隐式转换的形式。可惜，尽管这在 .NET 4 的早期 beta 版本的动态上下文中能用，现在却不行了。说起来，那个更显式的版本反倒更清楚地表达了我们想做什么。特别是它自然而然地暗示了这个转换可能因为某种原因失败。在我们的动态场景里，如果加法返回了不同的类型，或者（就像我们 `byte` 和 `int` 这个例子）结果超出了原类型的范围，就会发生这种情况。溢出是否应该抛异常，是个设计决策——你甚至可以准备两个方法，一个用 `checked` 块、一个用 `unchecked` 块，让调用方自己决定。

## 处理可空类型

`Enumerable.Sum` 中那些接受可空类型序列（比如 `IEnumerable<int?>`）的重载，行为和其他重载不太一样。如果我们把序列里的*每一个*项都加起来，结果会是 null——因为在 C# 可空类型的提升运算符规则下，把*任何东西*加到一个 null 值上都会得到 null。

所以那些常规的 LINQ to Objects 方法会直接跳过所有 null 值。尽管这些方法的返回类型是可空的，但返回的*值*永远不是 null，即使输入序列为空、或者只包含 null 值也一样。

我们*可以*试着用一种简单的方式，把加法做成只在项不为 null 时才执行：

```C#
// Warning: unhelpful code. See note below.
    public static T DynamicSum<T>(this IEnumerable<T> source)
    {
        T total = default(T);
        foreach (dynamic item in source)
        {
            if (item != null)
            {
                total = (T) (total + item);
            }
        }
        return total;
    }
```

遗憾的是，这在处理可空类型时并不能正常工作，因为 `total` 变量一开始就是 `null`——所以即便序列里*一个* null 值都没有，我们最后得到的仍然是 null。

我们可以在某种程度上修正它：先找出第一个非 null 的值，然后把其后的非 null 值都累加上去——但空序列、或者只含 null 值的序列该怎么办，这个问题依然存在。按照 LINQ to Objects 的模型，这种情况仍然应该返回相应的零值，而不是 null。

最简单的办法就是给可空值的情形加一个重载，保留原来的代码不动。如果我们把类型参数设为*非可空*的那个类型，但接受一个可空类型组成的序列，就能像平常那样取到合适的零值：

```C#
public static T? DynamicSum<T>(this IEnumerable<T?> source)
        where T : struct
    {
        T total = default(T);
        foreach (T? item in source)
        {
            if (item != null)
            {
                dynamic value = item.Value;
                total = (T) (total + value);
            }
        }
        return total;
    }
```

这就留下了一个问题：如果我们从一个泛型方法里调用 `DynamicSum`，而那个方法并不知道自己处理的是不是可空类型。这听起来正是动态类型该干的活，而我们确实可以在执行时调用正确的方法，像这样：

```C#
public static dynamic VeryDynamicSum(this object source)        
    {
        dynamic dynamicSource = source;
        return DynamicSum(dynamicSource);
    }
```

注意，我们不能把 `source` 参数声明成 `dynamic`，因为扩展方法不能以 `dynamic` 为目标……但以 `object` 为目标也差不多一样好。当然，我承认这个名字可以取得更好些……

## 小结

当然，动态求和一个序列还有其他可行的做法。希望这篇文章至少让你对"处理动态类型时该考虑哪些问题"有了一些想法。

> 本文是对[Summing a sequence dynamically](https://csharpindepth.com/articles/DynamicSum)这篇文章的翻译，作者是著有[C# in Depth](https://csharpindepth.com/)的大神[Jon Skeet](https://jonskeet.uk/)。非文章原文或本人对某段文字理解，会以斜体 *个人理解：xxx* 进行标注。本人翻译能力有限，强烈建议大家去看原版！
