---
title: 迭代器、迭代器块与数据管道
date: 2026-11-17 11:20:00
tags:
  - - C#
  - - 迭代器
  - - LINQ
  - - 翻译
categories:
  - - C#
  - - 翻译
top_img: /images/covers/streaming-and-iterators.png
---

## 引言

LINQ to Objects 是建立在迭代器之上的。迭代器一直是 .NET 的一部分，事实上它们正是 `foreach` 语句的基础——但有了 LINQ to Objects，它们变得前所未有的重要。本文会探讨迭代器到底是怎么回事、如何在 C# 2（或 3）里实现它们，然后讲讲 LINQ to Objects 的一些根本性的方面。这不是一篇 LINQ to Objects 的完整教程，但它为核心构建块提供了背景（当然也顺带讲*一点点* LINQ 本身）。<!--more-->

## 什么是迭代器？

迭代器模式很常见，在 .NET 里它被封装在 `IEnumerable` 和 `IEnumerator` 这两个接口以及它们的泛型版本中。（大多数时候我在描述时会用非泛型形式，在示例代码里则用泛型形式。显然泛型版本是强类型的，非泛型则不是，但除此之外唯一的区别就是泛型版本扩展了 `IDisposable`。）

基本想法是：作为数据的使用方，你可以通过 `GetEnumerator()` 调用向一个 `IEnumerable` 索取一个 `IEnumerator`，然后遍历这个 `IEnumerator` 的内容（用 `MoveNext()` 方法和 `Current` 属性），直到你不再需要更多数据，或者迭代器已经没有更多信息可以返回。比如，一个简单的 `foreach` 循环遍历 `IEnumerable<string>`，大致是这样的：

```C#
IEnumerator<string> iterator = dataSource.GetEnumerator();
while (iterator.MoveNext())
{
    string data = iterator.Current;
    // Use data within the body of the loop
}
```

为了简单起见，上面这段代码没有对迭代器调用 `Dispose`：为 `foreach` 循环生成的代码会使用 `try`/`finally` 结构，确保我们在用完迭代器后它会被释放。当迭代器是由后面会看到的 `yield return` 语句的魔法实现时，这一点很重要，但对基本模式本身来说并不关键。

### 为什么要有两个接口？

你很可能在问自己：为什么 `IEnumerable` 自己不带 `MoveNext()` 和 `Current` 成员——为什么我们需要一个额外的接口？想象一下，有两个不同的循环在遍历同一个列表。你不希望这两个循环互相干扰，所以你需要两个独立的表示，来表达“到目前为止我已经看过列表的多少了”这个意思。这个概念正是 `IEnumerator` 的用途。通常它会保存一些单独的信息（比如列表里的当前索引），同时也引用集合本身。虽然迭代器通常用于内存中的集合，但它们当然不必如此，这一点我们后面会看到。关键在于“请求数据、处理数据、再请求更多数据”这个循环。

## 迭代器块（C# 2）

在 C# 1 里，实现迭代器是件痛苦的事。你必须让你的集合类型实现 `IEnumerable`，然后另外建一个类型，它持有指向“父”实例的引用，通常还要加一些状态来记录你已经走到哪儿了。非常、*非常*容易搞出微妙的差一错误，所以一般来说，除非万不得已，开发者不会去做。

在 C# 2 里，当你用*迭代器块*来实现 `IEnumerable` 或 `IEnumerator`（或它们的泛型形式）时，编译器会替你把所有苦活干完。它为你构建一个*状态机*，得到的迭代器实际上会执行迭代器块里的代码，边走边产出值。演示比解释容易——下面是个完整的程序：

```C#
using System;
using System.Collections.Generic;

class IteratorBlockDemo
{
    static IEnumerable<string> GetDemoEnumerable()
    {
        yield return "start";
        
        for (int i=0; i < 5; i++)
        {
            yield return i.ToString();
        }
        
        yield return "end";
    }
    
    static void Main()
    {
        foreach (string x in GetDemoEnumerable())
        {
            Console.WriteLine(x);
        }
    }
}
```

程序的输出很简单：

```
start
0
1
2
3
4
end
```

我不打算细讲迭代器块工作原理的所有细节（更多信息见《C# in Depth》第 6 章，或者规范里的*大量*细节），但理解流程很重要：

1.  `Main` 调用 `GetDemoEnumerable()`
2.  `GetDemoEnumerable()` 创建由编译器生成的额外类型的一个新实例。*我们写下的源代码一行都还没执行。*
3.  `Main` 调用 `MoveNext()`
4.  迭代器执行代码，直到遇到 `yield` 语句。在我们的例子里，这是立刻发生的。迭代器记住当前项应该是 "start"，并返回 `true` 表示有数据可用。
5.  `Main` 用 `Current` 属性取出数据，然后打印出来。
6.  `Main` 再次调用 `MoveNext()`
7.  迭代器从之前到达的位置继续执行——换句话说，它走到第一个 `yield return` 之后的下一行。和之前一样，它执行代码（初始化 `i` 变量），直到遇到下一个 `yield` 语句。
8.  ……这个模式重复下去，直到某次 `MoveNext()` 调用到达方法末尾——此时该调用返回 `false`，表示没有更多数据可用了。

这里有三个非常重要的（且相互关联的）要点：第一，我们原来的源代码在第一调用 `MoveNext()` 之前一行都不会执行。第二，后续对 `MoveNext()` 的调用实际上会跳回到源代码中上次离开的位置。产出一个值有点像是把方法“暂停”了。第三，编译器会确保方法的*状态*（就局部变量而言）被保留下来——尽管 `i` 变量是迭代器块内部的局部变量，它的值也保存在迭代器里，这样下次调用 `MoveNext()` 时还能继续使用。

迭代器块的这些特性让它们与普通方法截然不同——在突然想通之前，要理解它们的工作方式可能相当费劲。在调试时单步进入一个迭代器块，亲自看看流程是怎么走的，会相当有用。现在我们已经了解了迭代器，也知道了它们在 C# 2 里有多容易实现，接下来想想怎么把它们串起来。

## 数据管道与可组合性

LINQ to Objects 建立在*数据管道*这个概念之上。我们从一个实现了 `IEnumerable` 的数据源开始，然后串起一大堆操作，每一个都作用于前一个的结果、并返回另一个 `IEnumerable`——尽管这个的类型可能不同。这种把小的操作串成大操作的做法，就叫*组合*（composition）。组合的重点在于让每个小操作都真正简单。LINQ to Objects 通过使用*委托*来提供灵活性，这些委托可以作用于输入元素——比如作为过滤器里的*谓词*，指明某个值是否应该通过过滤；或者作为*投影*，把一个值映射成另一个值。

举个无聊的例子：假设我们有一个乱序的数字序列，想要的结果是一个字符串序列——过滤掉所有负数，把剩下的排序，然后调用 `ToString` 以十六进制格式得到这些数字。在 C# 3 和 .NET 3.5 里，我们可以用下面这个*查询表达式*做到：

```C#
from number in numbers
where number >= 0
orderby number
select number.ToString("x")
```

解析器会把它翻译成一个非查询表达式，再交给编译器进一步处理：

```C#
numbers.Where(number => number >= 0)
       .OrderBy(number => number)
       .Select(number => number.ToString("x"))
```

`=>` 语法用于*lambda 表达式*——一种创建委托（以及*表达式树*）的简单方式。`Where`、`OrderBy` 和 `Select` 是 LINQ to Objects 提供的*扩展方法*，分别用于过滤、排序和投影。你大概能看出来，这里有很多不同的特性在相互作用，我没有打算深入讲其中大部分——本文只聚焦于迭代器的行为。

### 延迟执行与立即执行

就像我们用迭代器块自己创建迭代器时一样，上面那个表达式在执行时并不会执行任何有意义的代码——它只是搭好了管道，并不会真的去要数据。只有当第一次向 `Select` 的返回值索要数据时，它才开始真正做过滤/排序/投影。这叫作*延迟执行*。LINQ to Objects 里的很多查询运算符都用延迟执行，尤其是那些在概念上是在搭建更多管道的运算符。另一些查询运算符（如 `Count()`、`Max()` 和 `ToList()`）使用*立即执行*——也就是说它们立刻完成自己的工作，给你一个带有全部相应数据的结果。

意识到这里发生了什么很重要，这样你才知道操作究竟什么时候会真正发生。比如，如果你指定了一个可能抛异常的投影，你需要知道那个异常只会在请求数据时发生：仅仅因为对 `Select` 的调用没有抛异常，并不意味着一切都好！

### 流式与缓冲

还有一个概念与延迟/立即执行相似，但又有微妙的不同——那就是一个运算符是*流式*处理数据还是*缓冲*数据。流式处理的运算符基本上只向前一段管道索取它产出下一个结果所需的那点数据。`Select()` 是最简单的例子——它取出下一项，把指定的委托应用到它上面投影出结果，然后产出那个结果。`Where()` 稍微复杂一点——它会不断索取更多数据，直到要么*没有*更多数据，要么找到一个通过过滤的元素。不过一旦找到通过的元素，它就会产出那个值，而不去索取更多数据。

*缓冲*型的运算符行为不同。当被要求提供数据时，它们会把前一段管道的数据全部缓冲起来，然后算出所有结果。`Reverse()` 是最简单的例子——为了把所有数据以反序返回，你必须先走到最后一个元素，然后才能产出*任何东西*。排序和分组在 LINQ to Objects 里也会缓冲数据。

## 生成器

LINQ to Objects 里有几个*生成器*运算符——它们不依赖已有的序列，而是直接产生一个数据序列。`DefaultIfEmpty` 被列为生成器，但从某些角度说它不是——它作用于一个已有的序列，只不过那个序列可能是空的。这个我们这里不看。

另外还有三个标准的生成器运算符：`Empty`、`Repeat` 和 `Range`。我们来看看它们各自可能的实现，然后再想想怎么用组合把它们都换一种方式实现出来。当然，现实中这些都已经替我们实现好了，但这对于理解迭代器块和组合是很好的练习。

### Empty

`Empty` 做的事正如你所料——它返回一个空序列，也就是第一次调用 `MoveNext()` 就返回 `false` 的那种。说来奇怪，实现它并不像我们想的那么直截了当。我们不需要返回任何值，所以方法体留空就行了，对吧？嗯，不行……我们实际上需要这样的代码：

```C#
public static IEnumerable<TResult> Empty<TResult> ()
{
    yield break;
}
```

`yield break;` 语句是迭代器块里的“提前退出”——它就像方法末尾一样，让 `MoveNext()` 返回 `false`。那为什么非得有它？因为方法体为空的话，就没有任何东西告诉编译器我们想要一个迭代器块！只有当编译器在方法体内遇到 `yield return` 或 `yield break` 时，它才会把这个方法当作是用迭代器块实现的。这是我所能想到的、`yield break` 紧挨着方法末尾却仍然有效的唯一情形。

### Repeat

`Repeat` 接受两个参数——要返回的元素，以及返回多少次。它会把同一个元素产出你指定的次数，然后停止。实现起来很简单（包括检查计数不能为负）：

```C#
public static IEnumerable<TResult> Repeat<TResult>(TResult element, int count)
{
    if (count < 0)
    {
        throw new ArgumentOutOfRangeException("count");
    }
    for (int i=0; i < count; i++)
    {
        yield return element;
    }
}
```

关于错误检查一点说明：这里有个问题。理想情况下，如果 `count` 小于 0，我们希望 `Repeat` 方法在*被调用时*立刻抛异常。而现在，只有当某段代码试图遍历结果时才会抛出异常。这通常不是好事，如果[语言能在这方面给我们更多支持](http://codeblog.jonskeet.uk/2008/03/02/c-4-idea-iterator-blocks-and-parameter-checking)就好了。不过眼下，我们就让这个略有瑕疵的实现保持原样。

### Range

`Range` 同样直截了当。和前两个运算符不同，它不是泛型的：它*总是*返回 `IEnumerable<int>`。你要指定两个参数：起点，以及要返回多少个值。返回的序列从给定的值开始往上数——所以 `Range(10, 3)` 会产出 10、11、12。下面是实现，省略了错误检查：

```C#
public static IEnumerable<int> Range(int start, int count)
{
    for (int i=start; i < start+count; i++)
    {
        yield return i;
    }
}
```

## 一个生成器统御一切

上面这些生成器的问题在于，它们都有点太专门化了。特别是，它们不接受任何委托，这一点和 LINQ to Objects 里几乎其他所有东西都不同！我们来引入一个新的生成器。它如此通用，我觉得它配得上 `Generate` 这个名字。它会通过取一个起点、产出它、然后对当前值应用一个委托、再产出当前值、如此无限重复，产生一个无限序列。代码如下（没有错误检查——通常我们会检查 `step` 不为 null）：

```C#
public static IEnumerable<TSource> Generate<TSource>(TSource start,
                                                     Func<TSource,TSource> step)
{
    TSource current = start;
    while (true)
    {
        yield return current;
        current = step(current);
    }
}
```

代码简单得如我们所愿——但当然，我们绝不会想直接去遍历 `Generate` 的结果——它会一直跑下去。确实，没有组合的话，`Generate` 几乎没什么用。不过，只要巧妙地再配上一个运算符，我们就能轻松造出前面看过的三个生成器。与其在这里展示什么无限序列，我先缓一缓，等真正用 `Generate` 的时候再说。

### Take

`Take` 是我心目中的那种“管道”运算符——它接受一个序列并返回一个序列，就像 `Select` 和 `Where` 那样。除了“源”序列，你还要指定想要返回源中的多少个元素。`Take` 就是从源里不断产出元素，直到源里没有数据了，或者已经返回了所要求的元素个数。所以实现（略去错误检查）大概是这样的：

```C#
public static IEnumerable<TSource> Take<TSource>(this IEnumerable<TSource> source,
                                                 int count)
{
    foreach (TSource element in source)
    {
        if (count==0)
        {
            yield break;
        }
        count--;
        yield return element;
    }
}
```

注意这里用 `yield break` 来表示计数到 0 时我们已经完成了。（在这个特定情形下我们本来可以用一个简单的 `break`，因为循环之后没有别的代码了，但我觉得演示一个比 `Empty` 实现里那个更常规的 `yield break` 用法是值得的。）在 `source` 参数声明前面的 `this` 表明 `Take` 是一个扩展方法。

有了工具箱里的 `Take` 和 `Generate`，我们现在就能用组合重新实现 `Empty`、`Repeat` 和 `Range` 了：

```C#
public static IEnumerable<TResult> Repeat<TResult>(TResult element, int count)
{
    return Generate(element, x => x).Take(count);
}
    
public static IEnumerable<TResult> Empty<TResult>()
{
    return Repeat(default(TResult), 0);
}
    
public static IEnumerable<int> Range(int start, int count)
{
    return Generate(start, x => x+1).Take(count);
}
```

`Repeat` 的实现，就是先创建一个无限序列——从指定的元素开始，每一步对它应用一个恒等函数——然后用 `Take` 把这个无限序列截到所需的长度。一个 `Empty` 序列，就只是所需类型的默认值重复零次。最后 `Range` 又创建了一个无限序列——从指定的值开始反复加一——然后再用 `Take` 取出所需的元素个数。

用这种方式真正去实现那三个生成器函数并不特别有用——但它确实给了我们一个关于组合的有趣洞见。`Generate` 总是创建无限序列这一事实，会迫使你去思考：这些值只有在被请求时才会生成——如果 `Generate` 试图先把所有值都创建好、再一次性返回，那显然很快就会内存耗尽。我有一个稍微复杂些的例子，取自[一篇博客](http://codeblog.jonskeet.uk/2008/02/26/visualising-the-mandelbrot-set-with-linq-yet-again)，那里有完整的源码。那是一个用来生成曼德博集合可视化的查询表达式：

```C#
var query = from row in Enumerable.Range(0, ImageHeight)
            from col in Enumerable.Range(0, ImageWidth)
            // Work out the initial complex value from the row and column
            let c = new Complex((col * SampleWidth) / ImageWidth + OffsetX,
                                (row * SampleHeight) / ImageHeight + OffsetY)
            // Work out the number of iterations
            select Generate(c, x => x * x + c).TakeWhile(x => x.SquareLength < 4)
                                              .Take(MaxIterations)
                                              .Count() into count
            // Map that to an appropriate byte value
            select (byte)(count == MaxIterations ? 0 : (count % 255) + 1);
```

这里 `Generate` 用在嵌套查询里，用来找出某个点应该用什么颜色。我们生成一条无限的值路径，让它在复数域里四处跳跃，直到该点的模达到 2 或更大，或者我们已经迭代了感兴趣的次数为止。完整代码可以从那篇博客下载，但我希望这已经能说明组合这门技术有多强大。

## 小结

LINQ to Objects 里满是序列，以及一堆简单的运算符，它们组合起来能形成无数种可能。在《C# in Depth》里，我建议你在面对一个复杂的查询表达式时，去看看它是由哪些序列组合而成的。理解迭代器如何工作、流式/缓冲、以及延迟/立即执行，是能够有效使用 LINQ 的重要基础。组合查询很有趣，而最早出现在 C# 2 里的迭代器块让迭代器变得相当好用。本文只给了几个例子，但我相信你还能想出你自己的。来吧，创造你自己的运算符——最重要的是，*动手实验*。

对我们很多人来说，LINQ 不只是一项新技术，而是用 C# 写代码时接近问题的一种新方式。要真正掌握新想法总是需要一段时间，所以我由衷建议你在需要把它用于工作之前先玩玩 LINQ。其他的 LINQ 提供程序也许比 LINQ to Objects 更“性感”，但当你可以在内存里随随便便定义一个集合并随意摆弄它时，那种纯粹、简单和直接是别处没有的。

同样，对许多开发者来说，迭代器块是个谜。除非你已经在用序列的方式思考，否则你很可能从没写过一个迭代器块。希望本文已经让你看到它们可以多么简单，同时也给出了几个警告——那些地方你可能会预期不同的行为。迭代器块在 C# 2 里就已经很有用了，但当它们与 LINQ 结合时，真的可以变得非常惊艳，而且全都浓缩在极短的代码里。再说一遍——动手实验。长远来看这一切都会有用，而且如果你和我差不多，我保证你一路上会玩得很开心。

> 本文是对[Iterators, iterator blocks and data pipelines](https://csharpindepth.com/articles/StreamingAndIterators)这篇文章的翻译，作者是著有[C# in Depth](https://csharpindepth.com/)的大神[Jon Skeet](https://jonskeet.uk/)。非文章原文或本人对某段文字理解，会以斜体 *个人理解：xxx* 进行标注。本人翻译能力有限，强烈建议大家去看原版！
