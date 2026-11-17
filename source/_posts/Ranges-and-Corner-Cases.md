---
title: 区间与边角情况
date: 2026-11-17 10:50:00
tags:
  - - C#
  - - Range
  - - 翻译
categories:
  - - C#
  - - 翻译
top_img: /images/covers/ranges.png
---

《C# in Depth》第一版里有一个抽象的泛型 `Range` 类，它用一个虚方法在区间的各个元素之间步进。遗憾的是，有些边角情况处理起来相当别扭。本文与其说是在设计一个完美的区间类，不如说是在讨论需要考虑哪些因素。我的 [MiscUtil](https://jonskeet.uk/csharp/miscutil/) 库里有一个类处理了其中相当多的部分，当然也还有改进空间。我[之前写过一篇博客](http://codeblog.jonskeet.uk/2008/01/26/immutability-and-inheritance)谈这个话题，但我觉得它值得再聊一次。<!--more-->

## 大范围界定

先来比较笼统地定义一下我们希望能做到什么：

-   为任何合适的类型创建一种区间的表示
-   用某个自定义的步进函数遍历这些值

所以，范围内的东西并不多……不过魔鬼藏在细节里。我们明确地把一些东西排除在范围之外。我不打算：

-   考虑两个区间的相等性
-   考虑两个区间的交集、并集等等
-   把区间当成一组离散值（比如“0 到 100 之间的偶数”）
-   处理那些在区间内乱跳的步进函数（也就是说，它应该始终递增，或者始终递减）——后面我们会看到为什么

有了这么宽的界定，我们大概可以开始考虑一些细节了。

## 细节

首先想想哪些类型是适用的。我们希望它是泛型的，并且希望能够比较任意两个值。我们*可以*通过约束 `T` 实现 `IComparable<T>` 来做到——但那样就没法使用那些在泛型出现之前设计、并且没有更新实现新接口的类型了。而且，只用默认比较在之后可能会有些局限……特别是我心里已经有个想法：反转一个区间的一种办法，就是把它的最小值和最大值对调，同时把比较的方向也反过来。

说实话，我想不出有什么场合真的需要创建一个没有常规比较方式的区间——但我很确信我们*确实*需要能用自定义的比较。现在我们又有一个选择：这个比较是用 `IComparer<T>` 还是 `Comparison<T>` 来表达？两者等价——但 `IComparer<T>` 大概更常见，所以就用它。这也意味着我们可以直接用 `Comparer<T>.Default` 来做自然比较，不用再折腾别的。如果调用方想用 `Comparison<T>`，写个适配器类很容易（MiscUtil 里就有一个）。

回到约束的决策上，这是个有意思的设计取舍：是可能把调用方约束得太死、让他们在确实有正当理由为非自然可比较类型创建区间时感到憋屈，还是不约束、冒着类型被不当使用的风险？权衡下来，虽然我喜欢把 API 使用者推向合适的选择，但在这里我更倾向于不加约束。对那些怪异情形来说，代价太高了。

好，我们知道会有一个比较器——而且很可能会有上下边界。但这引出了更多问题：

-   边界应该是包含的还是排除的（也就是区间是闭的还是开的）？
-   我们*总是*需要两个边界吗，还是可以有只有下界或只有上界的区间？（甚至两者都没有，表示该类型所有值覆盖的区间。）
-   遍历一个下界为开的区间是什么意思？
-   遍历一个*没有*下界的区间是什么意思？

因为我想让这件事保持适度简单，所以暂时只做有限区间——也就是*总是*有上下两个边界。默认下界包含（闭）、上界排除（开），但会有可选的构造函数参数允许其他可能。同样，我默认使用该类型的默认比较器，但允许指定自定义比较。这里我用 `null` 作为比较器的默认值——诚然，如果有人*不小心*传了个 null 引用进来，这可能掩盖一个 bug，但除此之外相当简洁。（一点意外之喜是，如果你想*显式*使用默认比较器，可以传 `default(IComparer<T>)`——当然，那就是 null。）“从开边界开始迭代”的问题我们后面再说。

动手之前最后一个设计要点：我们要把这个类型做成不可变的。当然，如果元素类型本身可变，我们也无能为力，但大多数合理的区间元素类型本来就是天然不可变的。

## 最初的实现步骤

该写点真正的代码了。我们从非常少的开始：只有构造和一个包含性测试。

```C#
public sealed class Range<T>
{
    public T LowerBound { get; private set; }
    public T UpperBound { get; private set; }
    public bool InclusiveLowerBound { get; private set; }
    public bool InclusiveUpperBound { get; private set; }
    public IComparer<T> Comparer { get; private set; }

    public Range(T lowerBound, T upperBound,
                  bool inclusiveLowerBound = true,
                  bool inclusiveUpperBound = false,
                  IComparer<T> comparer = null)
    {
        LowerBound = lowerBound;
        UpperBound = upperBound;
        InclusiveLowerBound = inclusiveLowerBound;
        InclusiveUpperBound = inclusiveUpperBound;
        Comparer = comparer ?? Comparer<T>.Default;

        if (Comparer.Compare(LowerBound, UpperBound) > 0)
        {
            throw new ArgumentException("Invalid bounds");
        }
    }

    public bool Contains(T item)
    {
        int lowerCompare = Comparer.Compare(LowerBound, item);
        if (lowerCompare > (InclusiveLowerBound ? 0 : -1))
        {
            return false;
        }
        int upperCompare = Comparer.Compare(item, UpperBound);
        if (upperCompare > (InclusiveUpperBound ? 0 : -1))
        {
            return false;
        }
        return true;
    }
}
```

上下两个边界都要做重复的工作，这让我琢磨是不是应该*真的*把“边界”这个概念封装成它自己的类型……但眼下先不这么做。（如果我们要支持“无限”的上下边界，那大概就值得了。）`Contains` 的代码远谈不上漂亮，但单元测试是绿的，所以我相当满意它们能正常工作。

为了简洁，我用带私有 setter 的自动属性来实现我们想要的不可变。这意味着类型在它自己的代码里是可变的——这不理想，但在我们集中精力于整体设计的时候，先声明一个 readonly 字段再写个返回它的属性，会有点分散注意力。

添加 `WithExclusiveLowerBound`、`WithInclusiveLowerBound`、`WithLowerBound` 之类的方法，创建并返回一个新的 `Range` 实例，是很容易的事。同样，我们也可以建一个静态的非泛型类，配上泛型工厂方法，让类型参数可以从普通参数推断出来，像这样：

```C#
var range = Range.Of(5, 10);
```

这些都是有价值的功能，但没什么意思，所以这里不再深入。更有意思的是我们如何遍历一个区间。

## 遍历

回到涉及的设计问题。我觉得相当清楚的一点是，我们需要某种步进函数，把现有的值变成下一个值。然后就剩两个问题：第一个值用什么，以及什么时候停？

### 从哪里开始？

下界包含的情况下，第一个问题好回答：直接从下界开始。下界排除时就比较难定义了。假设我们在用一个区间 (0, 50)（两端都排除），每次步进 5。第一个值应该是 1（区间里最小的值）还是 5（从 0 开始并跳过第一个值的结果）？在很多情况下，找出一个*确实*被包含在区间里的最小值很难，在另一些情况下则根本不可能，尤其是有自定义比较器的时候。比如，我的单元测试里有一个自定义的 `IComparer<int>`，它只比较任意两个整数的最后两位。于是你可以有一个区间 (41, 37)，它“包含” 23、12 和 44，但不包含 38。这个区间里的最小值是什么？

我们*可以*要求调用方提供一个初始值，但我觉得那样很丑。我觉得更简单的是直接跳过第一个元素——于是下面这两个可迭代对象是等价的：

```C#
var range = new Range<int>(0, 50, false, false);
var simpleIterable = range.StepBy(x => x + 5);
var equivalentIterable = range.WithInclusiveLowerBound()
                              .StepBy(x => x + 5)
                              .Skip(1);
```

这无意中也透露了另一个设计要点：我们会有一个返回 `IEnumerable<T>` 的方法。我们也*可以*很容易地返回 `IEnumerator<T>`（实现会用迭代器块，两者都能用），但如果返回 `IEnumerable<T>`，日子会好过得多：我们可以用它 `foreach`，可以用在 LINQ 查询里，诸如此类。

接下来是第二个问题……

### 什么时候停？

这里同样有多个选项。最重要的一点是先排除一种*有毛病的*做法：我们不应该一直迭代下去，直到拿到的值不在区间里为止。那样的话，遍历一个 0 到 255（包含）的 `Range<byte>` 就不可能了——而那是一个完全合理的可遍历区间。有这些选项：

-   用*两个*步进函数，一个用来问*是否*还有下一个值，一个用来求出那个值是什么。
-   用一个步进函数，但让它一次返回这两项信息。这就引出几个子选项：
    -   用 `Func<Tuple<bool, T>>` 一起返回两个值
    -   用一个带 `out` 参数的委托（呃）
    -   试着用 `null` 作为“没有更多值”的结果；如果我们把 `T` 约束为值类型，这倒不难，但不是个好方案
-   *要么*在下一个值超出区间时停止，*要么*在它等于或小于前一个值时停止，从而防止回绕

我觉得最后一个选项最干净——而且它要求调用方做的工作最少，只需要给出一个简单的“在上一个值上加 n”这样的步进函数。它稍微不够灵活，因为我们不能有在区间内乱跳的步进函数，但它用更简单的方式覆盖了最常见的情形。实现容易，用起来也容易。

### 实现

既然知道要怎么做了，实现就非常简单。和 MiscUtil 里的实现不同，我们这里只需用一个迭代器块加一个方法来做这件苦活——这种情况下没必要单独搞一个公开类型。就本文而言，我也会要求调用方直接提供步进函数。在 MiscUtil 里，我用 Marc Gravell 那套巧妙的[泛型运算符支持](https://jonskeet.uk/csharp/genericoperators.html)，让任何支持相应 + 运算符的类型都能用一句简单的“每次加 X”调用，但那有点超出我在这里的目标。

下面是初始实现：

```C#
public IEnumerable<T> StepBy(Func<T, T> step)
{
    T current = LowerBound;
    // Skip the first value for exclusive lower bounds
    if (!InclusiveLowerBound)
    {
        current = step(current);
    }
    while (Contains(current))
    {
        yield return current;
        T next = step(current);
        // Handle a stepping function which wraps
        // round from a value near the end to one
        // near the start; or a stepping function
        // which does nothing.
        if (Comparer.Compare(next, current) <= 0)
        {
            yield break;
        }
        current = next;
    }
}
```

一个潜在的问题是：我们只在循环内部做回绕检查，而下界排除时我们在进入循环之前也用了步进函数。所幸这一点自然消解了：如果步进函数给出的第一个值小于下界，那个值反正也不会落在区间里，所以它也匹配不上循环条件。

另一种写起始值的方式是用条件运算符：

```C#
T current = InclusiveLowerBound ? LowerBound : step(LowerBound);
```

你觉得哪种更可读，纯属个人偏好。

还剩最后一个问题：我们好像总是在区间里*向上*步进。如果我们想倒数呢？

### 反转区间

反转一个区间相对直截了当，但我们确实需要把它的一切都反过来。我们要对调上下边界，连同它们的包含性——*还要*对调比较器。所幸写一个反转比较器非常容易——只要别掉进一个恶毒的陷阱。下面是简单地反转一个既有比较器的代码：

```C#
public sealed class ReverseComparer<T> : IComparer<T>
{
    private readonly IComparer<T> originalComparer;

    public ReverseComparer(IComparer<T> originalComparer)
    {
        this.originalComparer = originalComparer;
    }

    public int Compare(T x, T y)
    {
        return originalComparer.Compare(y, x);
    }
}
```

那陷阱是什么？在 `Compare` 方法里，你会很想直接把原比较的结果取负……但如果原结果是 `int.MinValue`，这就失效了：由于补码的工作方式，对 `int.MinValue` 取负，得到的结果还是 `int.MinValue` :( 有别的办法——比如你可以取原结果的*符号*再取负——但直接交换操作数就很漂亮地解决了。

有了反转比较器，我们就可以轻松地在 `Range` 上实现 `Reverse` 方法：

```C#
public Range<T> Reverse()
{
    return new Range<T>(
        lowerBound: UpperBound,
        upperBound: LowerBound,
        inclusiveLowerBound: InclusiveUpperBound,
        inclusiveUpperBound: InclusiveLowerBound,
        comparer:new ReverseComparer<T>(Comparer));
}
```

还有一些可做的优化，比如检测出反转比较器以避免把同一个比较器反转两次（你可以直接用原来的，省掉两层间接调用），但为简单起见我略去了。同样为了清晰，我用了 C# 4 的命名参数特性——当然它并不是必需的。

这里要注意一点：有些情况下，“反转原区间生成的序列”和“反转区间、再用一个反向的步进函数”，结果并不相同。比如考虑区间 [0, 5]（即 0 到 5 的整数，包含），步进函数是加 2。这会产出 { 0, 2, 4 }——但当你反转区间、把步进函数改成减 2 之后，序列是 { 5, 3, 1 }。当然，反转原序列最简单的办法是用 LINQ 内置的方法。

## 小结

我们这里没写多少代码，但最终得到了一个有用的小类。一开始就把这个类的范围界定清楚很重要——早期不同的决策会彻底改变实现——但同样重要的是考虑到那些边角情况，比如回绕、不改变原值的步进函数，以及返回 `int.MinValue` 的比较。这里所有代码都[可以下载](https://csharpindepth.com/files/ranges.zip)，其中包括一些简短的单元测试来检验它。

> *译者注：原文里那个下载链接（`/files/ranges.zip`）目前已经失效，返回 404。好在本文的代码在正文中都是完整的，只有附带的单元测试拿不到了。*

> 本文是对[Ranges and corner cases](https://csharpindepth.com/articles/Ranges)这篇文章的翻译，作者是著有[C# in Depth](https://csharpindepth.com/)的大神[Jon Skeet](https://jonskeet.uk/)。非文章原文或本人对某段文字理解，会以斜体 *个人理解：xxx* 进行标注。本人翻译能力有限，强烈建议大家去看原版！
