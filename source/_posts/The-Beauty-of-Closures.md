---
title: 闭包之美
date: 2026-11-16 20:35:00
tags:
  - - C#
  - - Java
  - - 闭包
  - - 翻译
categories:
  - - C#
  - - 翻译
top_img: /images/covers/closures.png
---

Java 7 还没发布的时候，我想写一篇博客，聊聊当时围绕 Java 7 闭包的各种提案。可是真动手写才发现，如果不先介绍一下闭包，这篇文章简直无从下笔。越写下去，这个引言变得越长，我担心读者还没读到 Java 7 那部分就跑光了。所以我想，不如干脆单独写一篇专门讲闭包的文章。至于那篇 Java 7 的博客——如你所见，最后也没写成。<!--more-->

大多数讲闭包的文章都是用函数式语言来写的，因为函数式语言对闭包的支持往往最好。但这也恰恰是为什么值得写一篇讲闭包在更传统的面向对象语言里长什么样的文章——如果你本来就在用函数式语言，那你多半早就知道闭包了。本文讨论的是 C#（1、2、3 版）和 Java（7 之前的版本）。

### 什么是闭包？

简单地说，闭包让你可以把某段行为封装起来，像传递其他对象一样把它传来传去，同时它仍然能访问自己被声明时所处的上下文。这样一来，你就可以把控制结构、逻辑运算符等等，与它们具体如何被使用的细节分离开来。能够访问原始上下文，正是闭包区别于普通对象的地方——尽管闭包的实现通常也是用普通对象加上编译器的一点小把戏来做到的。

用一个例子来展示闭包的诸多好处（以及它的实现方式）是最容易的。本文接下来大部分内容都会用同一个例子。我会用 Java 和 C#（不同版本）来展示代码，说明不同的做法。所有代码都可以[下载](http://csharpindepth.com/Files/Closures.zip)，方便你自己动手改。

### 示例场景：过滤列表

按某种条件过滤一个列表，是相当常见的需求。直接“内联”写也很容易：新建一个列表，遍历原列表，把符合条件的元素加进去。只需要几行代码，但把这段逻辑集中藏在一个地方仍然更好。真正困难的地方在于，如何把“该包含哪些元素”这件事封装起来。这就是闭包登场的地方。

虽然我在描述里用了“过滤”这个词，但它在“往新列表里筛进”和“从原列表里筛掉”之间是有点含糊的。比如一个“偶数过滤器”，到底是保留偶数还是剔除偶数？我们换一个术语——*谓词*（predicate）。谓词就是“能匹配或不能匹配某个给定元素”的东西。我们的例子会生成一个新列表，其中包含原列表中所有匹配给定谓词的元素。

在 C# 中，表示谓词最自然的方式是委托，事实上 .NET 2.0 里就有一个 `Predicate<T>` 类型。（题外话：不知为何 LINQ 更偏爱 `Func<T,bool>`；我觉得它描述性更差，不太明白为什么。这两个在功能上是等价的。）Java 里没有委托这种东西，所以我们就用一个只有一个方法的接口。当然，在 C# 里*也可以*用接口，但那样会明显更麻烦，而且没法用匿名方法和 lambda 表达式——而恰恰是这些特性在 C# 里实现了闭包。下面是这个接口/委托的定义，供参考：

```C#
// Declaration for System.Predicate<T>
public delegate bool Predicate<T>(T obj)
```

```java
// Predicate.java
public interface Predicate<T>
{
    boolean match(T item);
}
```

两种语言里用来过滤列表的代码都非常直白。说明一下，为了让例子简单些，我在 C# 里会避开扩展方法不用——但用过 LINQ 的人应该会联想到 `Where` 扩展方法。（两者在延迟执行上有差异，这个我先不展开。）

```C#
// In ListUtil.cs
static class ListUtil
{
    public static IList<T> Filter<T>(IList<T> source, Predicate<T> predicate)
    {
        List<T> ret = new List<T>();
        foreach (T item in source)
        {
            if (predicate(item))
            {
                ret.Add(item);
            }
        }
        return ret;
    }
}
```

```java
// In ListUtil.java
public class ListUtil
{
    public static <T> List<T> filter(List<T> source, Predicate<T> predicate)
    {
        ArrayList<T> ret = new ArrayList<T>();
        for (T item : source)
        {
            if (predicate.match(item))
            {
                ret.add(item);
            }
        }
        return ret;
    }
}
```

（两种语言里我都在同一个类里放了一个 `Dump` 方法，它只是把给定的列表输出到控制台。）

过滤方法定义好了，接下来要调用它。为了说明闭包的重要性，我们先从一个不用闭包也能解决的简单场景开始，然后再转向更难的。

### 过滤器 1：匹配短字符串（长度固定）

这个示例场景会非常基础，但我希望你还是能看出它的意义。我们拿一个字符串列表，生成另一个只包含原列表中“短”字符串的列表。构建列表显然很简单——有难度的是创建那个谓词。

在 C# 1 里，我们必须有一个方法来承载谓词的逻辑，然后通过指定方法名来创建委托实例。（当然这段代码其实不是合法的 C# 1，因为用了泛型，但请把注意力放在委托实例是怎么创建出来的——那才是重点。）

```C#
// In Example1a.cs
static void Main()
{
    Predicate<string> predicate = new Predicate<string>(MatchFourLettersOrFewer);
    IList<string> shortWords = ListUtil.Filter(SampleData.Words, predicate);
    ListUtil.Dump(shortWords);
}

static bool MatchFourLettersOrFewer(string item)
{
    return item.Length <= 4;
}
```

在 C# 2 里我们有三个选择。可以完全沿用上面的代码；也可以用新增的方法组转换把代码*稍微*简化一点点；还可以用*匿名方法*把谓词的逻辑“内联”写出来。增强版的方法组转换没什么好讲的——不过就是把 `new Predicate<string>(MatchFourLettersOrFewer)` 改成 `MatchFourLettersOrFewer`，它在[下载的代码](http://csharpindepth.com/Files/Closures.zip)里（`Example1b.cs`）。匿名方法这个选择有意思得多：

```C#
static void Main()
{
    Predicate<string> predicate = delegate(string item)
        {
            return item.Length <= 4;
        };
    IList<string> shortWords = ListUtil.Filter(SampleData.Words, predicate);
    ListUtil.Dump(shortWords);
}
```

我们不再需要一个多余的方法，谓词的行为在使用的现场一目了然。很好。那它在背后是怎么工作的？如果你用 ildasm 或 Reflector 去看生成的代码，会发现它和上一个例子几乎一样：编译器只是替我们做了其中一部分工作。后面我们会看到，它还能做得更多……

在 C# 3 里，上面的选择依然都在，另外还多了 *lambda 表达式*。就本文的目的而言，lambda 表达式其实只是匿名方法的一种简写形式。（两者在 LINQ 语境下最根本的差别在于 lambda 表达式可以转换成表达式树，但这跟本文无关。）用 lambda 表达式写出来是这样的：

```C#
static void Main()
{
    Predicate<string> predicate = item => item.Length <= 4;
    IList<string> shortWords = ListUtil.Filter(SampleData.Words, predicate);
    ListUtil.Dump(shortWords);
}
```

别在意用了 `<=` 之后看起来像是一个大箭头指着 `item.Length`——我是为了前后一致才这么写的，它完全可以写成 `Predicate<string> predicate = item => item.Length < 5;`

在 Java 里我们不需要创建委托——我们需要实现一个接口。*最简单*的做法是新建一个类来实现这个接口，像这样：

```java
// In FourLetterPredicate.java
public class FourLetterPredicate implements Predicate<String>
{
    public boolean match(String item)
    {
        return item.length() <= 4;
    }
}

// In Example1a.java
public static void main(String[] args)
{
    Predicate<String> predicate = new FourLetterPredicate();
    List<String> shortWords = ListUtil.filter(SampleData.WORDS, predicate);
    ListUtil.dump(shortWords);
}
```

这没用到任何花哨的语言特性，但为了表达一小段逻辑，就得多出一个完整的类。按照 Java 的惯例，这个类多半会放在另一个文件里，这让使用它的代码更难读。我们也可以改成*嵌套*类，但逻辑仍然离使用它的代码很远——实际上，这就是 C# 1 那套方案的一个更啰嗦的版本。（同样，嵌套类的版本我这里不展示，它在下载的代码里，是 `Example1b.java`。）不过 Java *确实*允许把代码内联写出来，用的是*匿名类*。下面就是它的全貌：

```java
// In Example 1c.java
public static void main(String[] args)
{
    Predicate<String> predicate = new Predicate<String>()
    {
        public boolean match(String item)
        {
            return item.length() <= 4;
        }
    };
    
    List<String> shortWords = ListUtil.filter(SampleData.WORDS, predicate);
    ListUtil.dump(shortWords);
}
```

可以看到，和 C# 2、C# 3 的解法相比，这里有大量语法噪音，但至少代码出现在了对的位置上。这就是 Java 目前对闭包的支持……而这也正好把我们带进了第二个例子。

### 过滤器 2：匹配短字符串（长度可变）

到目前为止，我们的谓词还不需要任何上下文——长度是写死的，要检查的字符串作为参数传进来。现在改一下需求：让用户自己指定允许的最大长度。

先回到 C# 1。它没有任何真正的闭包支持——没有一个简单的地方可以存放我们需要的那点信息。是的，我们可以用方法当前上下文里的一个变量（比如第一个例子里主类的静态变量），但这显然不是好办法——首先它立刻就把线程安全毁掉了。正确的做法是新建一个类，把所需的状态从当前上下文中分离出来。这时候它看起来和最早的 Java 代码很像，只是用委托代替了接口：

```C#
// In VariableLengthMatcher.cs
public class VariableLengthMatcher
{
    int maxLength;

    public VariableLengthMatcher(int maxLength)
    {
        this.maxLength = maxLength;
    }

    /// <summary>
    /// Method used as the action of the delegate
    /// </summary>
    public bool Match(string item)
    {
        return item.Length <= maxLength;
    }
}

// In Example2a.cs
static void Main()
{
    Console.Write("Maximum length of string to include? ");
    int maxLength = int.Parse(Console.ReadLine());

    VariableLengthMatcher matcher = new VariableLengthMatcher(maxLength);
    Predicate<string> predicate = matcher.Match;
    IList<string> shortWords = ListUtil.Filter(SampleData.Words, predicate);
    ListUtil.Dump(shortWords);
}
```

改成 C# 2 和 C# 3 的代码就简单了：两种情况都只是把写死的上限换成了那个参数。现在先别担心它到底是怎么做到的——等一会儿看过 Java 代码，我们再一起分析。

```C#
// In Example2b.cs (C# 2)
static void Main()
{
    Console.Write("Maximum length of string to include? ");
    int maxLength = int.Parse(Console.ReadLine());

    Predicate<string> predicate = delegate(string item)
    {
        return item.Length <= maxLength;
    };
    IList<string> shortWords = ListUtil.Filter(SampleData.Words, predicate);
    ListUtil.Dump(shortWords);
}
```

```C#
// In Example2c.cs (C# 3)
static void Main()
{
    Console.Write("Maximum length of string to include? ");
    int maxLength = int.Parse(Console.ReadLine());

    Predicate<string> predicate = item => item.Length <= maxLength;
    IList<string> shortWords = ListUtil.Filter(SampleData.Words, predicate);
    ListUtil.Dump(shortWords);
}
```

Java 代码（用匿名类的那个版本）的改动类似，但有一个小转折——我们必须把参数声明为 `final`。听起来很怪，但 Java 这么设计是有道理的。先看代码，再分析它在做什么：

```java
// In Example2a.java
public static void main(String[] args) throws IOException
{
    System.out.print("Maximum length of string to include? ");
    BufferedReader console = new BufferedReader(new InputStreamReader(System.in));
    final int maxLength = Integer.parseInt(console.readLine());
    
    Predicate<String> predicate = new Predicate<String>()
    {
        public boolean match(String item)
        {
            return item.length() <= maxLength;
        }
    };
    
    List<String> shortWords = ListUtil.filter(SampleData.WORDS, predicate);
    ListUtil.dump(shortWords);
}
```

那么，Java 和 C# 的代码差别在哪里？*在 Java 中，被匿名类捕获的是变量的**值**。在 C# 中，被委托捕获的是**变量本身**。* 为了证明 C# 捕获的是变量，我们把 C# 3 的代码改一下：在列表被过滤一次之后改变参数的值，然后再过滤一次：

```C#
// In Example2d.cs
static void Main()
{
    Console.Write("Maximum length of string to include? ");
    int maxLength = int.Parse(Console.ReadLine());

    Predicate<string> predicate = item => item.Length <= maxLength;
    IList<string> shortWords = ListUtil.Filter  (SampleData.Words, predicate);
    ListUtil.Dump(shortWords);

    Console.WriteLine("Now for words with <= 5 letters:");
    maxLength = 5;
    shortWords = ListUtil.Filter(SampleData.Words, predicate);
    ListUtil.Dump(shortWords);
}
```

注意我们*只*改变了局部变量的值。我们并没有重新创建委托实例，也没做别的事。而委托实例能访问这个局部变量，所以它看得见变化。再往前走一步，让谓词自己去改变这个变量的值：

```C#
// In Example2e.cs
static void Main()
{
    int maxLength = 0;

    Predicate<string> predicate = item => { maxLength++; return item.Length <= maxLength; };
    IList<string> shortWords = ListUtil.Filter(SampleData.Words, predicate);
    ListUtil.Dump(shortWords);
}
```

我就不深究这一切到底是怎么实现的了——想看这些血淋淋的细节，请读[《C# in Depth》](http://csharpindepth.com)第 5 章。你只需要做好心理准备：你对“局部变量”这个词的理解可能会被彻底颠覆。

既然看到了 C# 对捕获变量变化的反应，那 Java 里会怎样？答案很简单：你没法改变被捕获变量的值。它*必须*是 `final` 的，所以这个问题根本不存在。不过，假如你*能够*改变这个变量的值，你会发现在谓词那边不会有任何反应。被捕获变量的值在谓词创建时就被复制了，存放在匿名类的实例里。对于引用类型的变量，别忘了变量里存的只是那个*引用*，而不是对象当前的状态。比如你捕获了一个 `StringBuilder`，然后往里面追加内容，这些变化在匿名类里是*能*看到的。

### 两种捕获策略的比较：复杂性与能力

显然，Java 的方案限制更多，但它也确实让事情简单了不少。局部变量的行为还是原来那样，而且在很多情况下代码也更好懂。比如看下面这段代码，分别用 Java 的 `Runnable` 接口和 .NET 的 `Action` 委托——两者都表示不带参数、不返回值的操作。先看 C# 的：

```C#
// In Example3a.cs
static void Main()
{
    // First build a list of actions
    List<Action> actions = new List<Action>();
    for (int counter = 0; counter < 10; counter++)
    {
        actions.Add(() => Console.WriteLine(counter));
    }

    // Then execute them
    foreach (Action action in actions)
    {
        action();
    }
}
```

输出会是什么？其实我们只声明了一个 `counter` 变量——所以所有 `Action` 实例捕获的都是同一个 `counter` 变量。结果是每一行都打印 10。要把代码“修好”、让它输出大多数人预期的结果（也就是 0 到 9），我们需要在循环体里再引入一个变量：

```C#
// In Example3b.cs
static void Main()
{
    // First build a list of actions
    List<Action> actions = new List<Action>();
    for (int counter = 0; counter < 10; counter++)
    {
        int copy = counter;
        actions.Add(() => Console.WriteLine(copy));
    }

    // Then execute them
    foreach (Action action in actions)
    {
        action();
    }
}
```

每循环一次，我们就会得到 `copy` 变量的一个不同的*实例*——每个 `Action` 捕获的是各自不同的变量。如果你去看编译器在背后做了什么，这完全说得通，但一开始它确实违背了大多数开发者（包括我）的直觉。

Java 则完全禁止第一种写法——你根本不能捕获 `counter` 变量，因为它不是 final 的。要用 final 变量，最后写出来的是这样的代码，和 C# 那边非常接近：

```java
// In Example3a.java
public static void main(String[] args)
{
    // First build a list of actions
    List<Runnable> actions = new ArrayList<Runnable>();        
    for (int counter=0; counter < 10; counter++)
    {
        final int copy = counter;
        actions.add(new Runnable()
        {
            public void run()
            {
                System.out.println(copy);
            }
        });
    }
    
    // Then execute them
    for (Runnable action : actions)
    {
        action.run();
    }
}
```

在“捕获值”的语义下，含义是相当清楚的。由于语法更啰嗦，产出的代码还是不如 C# 那边好看，但 Java 把正确的写法变成了唯一的选择，强制你这么写。代价是：当你*想要*原来那份 C# 代码的行为时（有时候确实会想要），在 Java 里实现起来就很别扭。（你可以用一个单元素数组，捕获这个数组的引用，然后在需要时改变元素的值，但这是一种相当难看的变通手法。）

### 这有什么大不了的？

在这个例子里，我们只看到了闭包带来的一点点好处。没错，我们把控制结构那一侧和过滤本身所需的逻辑分开了，但光凭这一点，代码并没有变得*那么*简单。这是很常见的情形——一个新特性放在过于简单的例子里，往往显得没那么惊艳。然而闭包常常带来的好处是*可组合性*。如果这话听起来有点勉强，我同意——而这本身就说明了一些问题。等你熟悉了闭包、甚至有点上瘾之后，这层联系会显得显而易见。在那之前，它看着就很晦涩。

闭包并不天然提供可组合性。它们做的只是让实现委托变得更容易（或者说让实现单方法接口更容易——为简单起见我就用“委托”这个词了）。在没有闭包支持的情况下，写个小循环比“调用另一个方法去循环、并给它传一个委托来完成其中一部分逻辑”要容易。即便有了“在现有类上加个方法”这种委托支持，你仍然会失去逻辑的局部性，*而且*往往需要比轻易能提供的更多的上下文信息。

所以，闭包让创建委托变得更简单。这意味着设计*使用*委托的 API 变得更值得。（我不认为这只是巧合：在 .NET 1.1 里，委托几乎只被用来启动线程和处理事件。）一旦你开始用委托的方式思考，组合它们的方法就变得显而易见了。比如，创建一个接收另外两个谓词、表示二者逻辑与或逻辑或（当然也可以是其他布尔运算）的 `Predicate<T>`，是件轻而易举的事。

另一种组合方式，是把一个委托的结果喂给另一个委托，或者把一个委托柯里化，产生一个新的委托。一旦你开始把逻辑当成另一种数据来看待，各种可能性就都出现了。

组合的用途还不止于此——整个 LINQ 都建立在它之上。我们用列表做的那个过滤，只是“一串数据变换成另一串数据”的一个例子。其他操作还包括排序、分组、与另一个序列合并、投影。以往把这些操作一个个手写出来并不算太痛苦，但当你的“数据管道”里包含的不止几次变换时，复杂度很快就会累积起来。此外，借助 LINQ to Objects 提供的延迟执行和数据流式处理，相比“跑完一个变换再跑下一个”的直白实现，你在内存开销上要省得多。复杂度之所以被消解，并不是因为单个变换本身有多聪明——而是因为你能用闭包就地把一小段逻辑写在它该在的位置，还能用一个设计良好的 API 把各种操作组合起来。

### 小结

闭包一开始是有点让人提不太起劲的。没错，它们让你能相当简单地实现一个接口或创建一个委托实例（取决于语言）。它们的威力只有在你把它们和那些善用闭包的库一起使用时才显现出来——那些库让你能在恰好的位置表达自定义的行为。当这些库还允许你以自然的方式把几个简单步骤组合起来、实现相当复杂的行为时，你得到的东西的复杂度就只有各部分复杂度之和——而不是各部分复杂度的*乘积*。虽然我不太认同“可组合性是战胜复杂性的银弹”这种说法，但它确实是一项强大的技术，而且因为有闭包，它能适用的场景多了很多。

lambda 表达式的一个关键特性是简洁。把前面那段 Java 代码和 C# 代码放在一起比较，Java 显得极其笨重。这正是 Java 闭包的各种提案想要解决的问题之一。关于这些不同的提案，我会在不久之后的一篇博客里谈谈我的看法。

> 本文是对[The Beauty of Closures](https://csharpindepth.com/articles/Closures)这篇文章的翻译，作者是著有[C# in Depth](https://csharpindepth.com/)的大神[Jon Skeet](https://jonskeet.uk/)。非文章原文或本人对某段文字理解，会以斜体 *个人理解：xxx* 进行标注。本人翻译能力有限，强烈建议大家去看原版！
