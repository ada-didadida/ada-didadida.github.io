---
title: 迭代器块的实现细节：自动生成的状态机
date: 2026-11-17 10:30:00
tags:
  - - C#
  - - 迭代器
  - - 状态机
  - - 翻译
categories:
  - - C#
  - - 翻译
top_img: /images/covers/iterator-block-implementation.png
---

## 引言

迭代器从 .NET 第一个版本起就存在了，但真正让它们变得易于使用的，是 C# 2 引入的*迭代器块*。本文会深入探讨微软的 C# 编译器是如何把迭代器块转换成状态机的。如果你对 `IEnumerable` 和 `IEnumerator` 这两个接口（以及它们的泛型版本）还不太确定，或者对迭代器块的基本用法还不熟悉，那么在读下去之前，建议先看看[这篇有更详细介绍的文章](https://csharpindepth.com/articles/StreamingAndIterators)（[译文](/2026/11/17/Iterators-Iterator-Blocks-and-Data-Pipelines/)；或者[《C# in Depth》第 6 章](http://www.manning-source.com/books/skeet/Chapter6sample.pdf)，那是一章免费的样章）。<!--more-->

本文几乎全是与具体实现相关的细节。[Mono](http://mono-project.com) 编译器的做法可能略有不同。不过很可能非常相似；当你拿不准哪些东西可以依赖时，去查语言规范就对了。（迭代器块在 [C# 3.0 规范](http://download.microsoft.com/download/3/8/8/388e7205-bc10-4226-b2a8-75351c669b09/CSharp%20Language%20Specification.doc)的第 10.14 节。）

## 高层次概览：这个模式长什么样？

这篇文章的由来，是一位读者问起：用迭代器块实现的方法，返回 `IEnumerator` 和返回 `IEnumerable` 有什么不同。除此之外，还有非泛型接口与泛型接口之间的选择问题。我们先对四种可能性都用同一个迭代器块，看看生成的代码有哪些差异。本文中我会一直给出编译器所产代码的 C# 等价形式。显然编译器并不会真的产出 C#，是我用 [Reflector](http://www.red-gate.com/products/reflector/) 反编译成 C# 的。

第一个例子只依次产出 0 到 9 这些数字。一开始我们把方法声明为返回非泛型的 `IEnumerator`。完整代码如下：

```C#
using System;
using System.Collections;

class Test
{
    static IEnumerator GetCounter()
    {
        for (int count = 0; count < 10; count++)
        {
            yield return count;
        }
    }
}
```

很简单，对吧？那咱们看看编译之后它变成了什么。深呼吸……

```C#
internal class Test
{
    // Note how this doesn't execute any of our original code
    private static IEnumerator GetCounter()
    {
        return new <GetCounter>d__0(0);
    }

    // Nested type automatically created by the compiler to implement the iterator
    [CompilerGenerated]
    private sealed class <GetCounter>d__0 : IEnumerator<object>, IEnumerator, IDisposable
    {
        // Fields: there'll always be a "state" and "current", but the "count"
        // comes from the local variable in our iterator block.
        private int <>1__state;
        private object <>2__current;
        public int <count>5__1;

        [DebuggerHidden]
        public <GetCounter>d__0(int <>1__state)
        {
            this.<>1__state = <>1__state;
        }

        // Almost all of the real work happens here
        private bool MoveNext()
        {
            switch (this.<>1__state)
            {
                case 0:
                    this.<>1__state = -1;
                    this.<count>5__1 = 0;
                    while (this.<count>5__1 < 10)
                    {
                        this.<>2__current = this.<count>5__1;
                        this.<>1__state = 1;
                        return true;
                    Label_004B:
                        this.<>1__state = -1;
                        this.<count>5__1++;
                    }
                    break;

                case 1:
                    goto Label_004B;
            }
            return false;
        }

        [DebuggerHidden]
        void IEnumerator.Reset()
        {
            throw new NotSupportedException();
        }

        void IDisposable.Dispose()
        {
        }

        object IEnumerator<object>.Current
        {
            [DebuggerHidden]
            get
            {
                return this.<>2__current;
            }
        }

        object IEnumerator.Current
        {
            [DebuggerHidden]
            get
            {
                return this.<>2__current;
            }
        }
    }
}
```

我们先比较宏观地看看发生了什么，逐个成员解释。真正的工作都在 `MoveNext()` 里，所以这里先一语带过，等把其余代码都弄明白之后，再专门深入这个方法。从上到下看这段代码，下面是逐条解说：

-   上面展示的源码并不是完全合法的 C#——它用了在正常 C# 中非法的名字。在生成的代码里使用非法名字是很常见的做法，既杜绝了与普通名字冲突的可能，也让手写的 C# 没法显式地去用这些生成的代码。
-   调用 `GetCounter()` 只是调用了 `<GetCounter>d__0` 的构造函数，这个类型才是迭代器的实现。构造函数又只是设置了迭代器的状态。我们原来那个类里的代码，一行都还没执行。
-   代码中有若干元素被 `CompilerGenerated` 和 `DebuggerHidden` 特性修饰。`CompilerGenerated` 几乎无关紧要——MSDN 文档说它允许 SQL Server 获得额外访问权限，但 99.9% 的开发者根本不需要知道这个。不过出于清晰起见，能看到它也不错。`DebuggerHidden` 只是让调试器（好吧，是那些愿意理会这个特性的调试器）不要单步进入或中断在这段代码里。从这里往后，我就不再显示这些特性了。
-   `<GetCounter>d__0`（下文简称“迭代器类型”）实现了三个接口：`IEnumerator<object>`、`IEnumerator` 和 `IDisposable`。其实第一个接口本身就隐含了后两个，但我把它们都列出来，好让事情更清楚。有意思的是，尽管我们原来的 `GetCounter()` 方法用的是非泛型形式，这里实现的却是泛型接口。这大概只是为了一致性——等我们让编译器用泛型版本时，就会看到变化其实非常小。
-   `IDisposable` 的实现非常重要（除了实现 `IEnumerator<object>` 本身就需要它之外）。C# 的 `foreach` 语句会对任何实现了 `IDisposable` 的迭代器调用 `Dispose`；这个调用放在 `finally` 块里，和 `using` 语句一样。在极少数不用 `foreach` 循环、而是手动使用迭代器的情况下，你应该用 `using` 语句来确保 `Dispose` 被调用。后面我们会看到为什么。
-   迭代器类型是嵌套的，这意味着它可以访问外层类的所有私有成员。如果你的迭代器块要调用其他私有方法、或访问私有变量（当然也包括其他私有成员），这一点就很重要。后面我们会看一个例子。
-   迭代器类型有三个字段——两个私有、一个公开。两个私有变量用来记录 `Current` 属性该返回的值，以及迭代器当前处于什么状态。这两个我们后面会详细得多地讨论。说实话，我也不知道为什么那个和计数相关的变量是公开的。等我们看到原始迭代器块方法带参数时会怎样，就会看到公开字段的用法——虽说换一种设计决策本可以让所有字段都保持私有。
-   构造函数只是设置迭代器的状态。在这个例子里，唯一调用构造函数的就是 `GetCounter()` 方法，它总是传入 0 作为初始状态。但过一会儿我们就会看到，在其他情形下，把状态作为参数传进来是有真正理由的。
-   `MoveNext()` 基本上就是一个大的 `switch` 语句。它永远都是这样，而它 switch 的对象是状态机里的一个状态，这样它就知道接下来该执行哪一段代码。我们下面会花大量篇幅研究它。
-   来自 `IEnumerator` 的 `Reset` 方法总是抛出 `System.NotSupportedException`。这不只是一个实现上的决定——C# 规范就是这么要求的。
-   在这个最初的简单例子里，`Dispose` 方法什么都不做。我们会把它作为一个单独的话题来看。
-   `Current` 的 `IEnumerator` 和 `IEnumerator<object>` 两个实现，都只是返回 `<>2__current` 变量的值。C# 语言规范明确把 `Current` 属性在“怪异”情形下的行为定义为未指定（比如在第一次调用 `MoveNext()` 之前访问它，或者 `MoveNext()` 已经返回了 `false` 之后）。

### 泛型接口与非泛型接口

我们已经看到，把一个方法声明为返回 `IEnumerator`，结果会得到一个同时也实现了 `IEnumerator<object>` 的迭代器。现在把代码稍作改动，让方法显式返回 `IEnumerator<int>`：

```C#
using System;
using System.Collections.Generic;

class Test
{
    static IEnumerator<int> GetCounter()
    {
        for (int count = 0; count < 10; count++)
        {
            yield return count;
        }
    }
}
```

我就不贴生成的完整代码了，变化如下。首先最明显的一点，`GetCounter()` 方法的返回类型变了，其他没变：

```C#
private static IEnumerator<int> GetCounter()
{
    return new <GetCounter>d__0(0);
}
```

同样，迭代器现在实现的是 `IEnumerator<int>` 而不是 `IEnumerator<object>`。这里涉及的类型被称为迭代器的 *yield 类型*。每个 `yield return` 语句返回的东西都必须能隐式转换成 yield 类型。如我们所见，使用非泛型接口时，yield 类型就是 `object`。新的类签名是这样：

```C#
private sealed class <GetCounter>d__0 : IEnumerator<int>, IEnumerator, IDisposable
```

同样，实现泛型接口的 `Current` 属性以及它的后备变量都改成了 `int`：

```C#
private int <>2__current;

int IEnumerator<int>.Current
{
    get
    {
        return this.<>2__current;
    }
}
```

除了这些细微改动，这个类看起来和之前一样。

### 返回 `IEnumerable`

如果我们把原始代码改成返回 `IEnumerable` 或它的泛型等价物而不是 `IEnumerator`，变化就会显著得多。我们把代码改成返回 `IEnumerable<int>`，并且从今往后都用泛型接口，因为我们已经看到它们差别很小。那么，源码是：

```C#
using System;
using System.Collections.Generic;

class Test
{
    static IEnumerable<int> GetCounter()
    {
        for (int count = 0; count < 10; count++)
        {
            yield return count;
        }
    }
}
```

……生成的代码是（为简洁起见去掉了特性）：

```C#
internal class Test
{
    private static IEnumerable<int> GetCounter()
    {
        return new <GetCounter>d__0(-2);
    }

    private sealed class <GetCounter>d__0 : IEnumerable<int>, IEnumerable, IEnumerator<int>, IEnumerator, IDisposable
    {
        // Fields
        private int <>1__state;
        private int <>2__current;
        private int <>l__initialThreadId;
        public int <count>5__1;

        public <GetCounter>d__0(int <>1__state)
        {
            this.<>1__state = <>1__state;
            this.<>l__initialThreadId = Thread.CurrentThread.ManagedThreadId;
        }

        private bool MoveNext()
        {
            switch (this.<>1__state)
            {
                case 0:
                    this.<>1__state = -1;
                    this.<count>5__1 = 0;
                    while (this.<count>5__1 < 10)
                    {
                        this.<>2__current = this.<count>5__1;
                        this.<>1__state = 1;
                        return true;
                    Label_0046:
                        this.<>1__state = -1;
                        this.<count>5__1++;
                    }
                    break;

                case 1:
                    goto Label_0046;
            }
            return false;
        }

        IEnumerator<int> IEnumerable<int>.GetEnumerator()
        {
            if ((Thread.CurrentThread.ManagedThreadId == this.<>l__initialThreadId) && (this.<>1__state == -2))
            {
                this.<>1__state = 0;
                return this;
            }
            return new Test.<GetCounter>d__0(0);
        }

        IEnumerator IEnumerable.GetEnumerator()
        {
            return ((IEnumerable<Int32>) this).GetEnumerator();
        }

        void IEnumerator.Reset()
        {
            throw new NotSupportedException();
        }

        void IDisposable.Dispose()
        {
        }

        int IEnumerator<int>.Current
        {
            get
            {
                return this.<>2__current;
            }
        }

        object IEnumerator.Current
        {
            get
            {
                return this.<>2__current;
            }
        }
    }
}
```

我又把完整代码贴了一遍，方便一眼看出差异：

-   很明显，迭代器类型现在实现了 `IEnumerable<int>`，但它*同时*仍然实现 `IEnumerator<int>`。一个东西既可以被迭代、又是迭代器，这非常古怪。这是针对常见情形的一种优化，我们马上就会看到。
-   `IEnumerator<int>` 的实现*完全*没变——`Reset` 仍然抛异常，`Current` 仍然只是返回当前值，`MoveNext()` 里还是同样的逻辑。
-   创建迭代器实例的那个方法，传给构造函数的初始状态是 -2 而不是 0。
-   多了一个私有变量 `<>l__initialThreadId`，它在构造函数里被设置为创建该实例的线程。
-   `GetEnumerator()` 要么把状态设为 0 并返回 `this`，要么创建一个处于状态 0 的新迭代器实例。

那么，这是怎么回事？最常见的使用场景（远远最常见的）是这样的：创建一个 `IEnumerable<T>` 实例，然后某个东西（比如 `foreach` 语句）从同一个线程调用 `GetEnumerator()`，遍历数据，最后释放掉 `IEnumerator<T>`。最初那个 `IEnumerable<T>` 在首次调用 `IEnumerator<T>` 之后就不会再被使用了。考虑到这种模式的普遍性，C# 编译器选择一种针对这种情形优化的模式就很合理了。在这种行为下，虽然我们用一个对象实现了两个不同的接口的实例，但只创建了一个对象。状态 -2 用来表示“`GetEnumerator()` 还没被调用过”，而状态 0 用来表示“我准备好开始迭代了，尽管 `MoveNext()` 还没被调用过”。

不过，如果你试图从另一个线程调用 `GetEnumerator()`，或者在状态不是 -2 的时候调用它，代码就必须新建一个实例，才能分别跟踪不同的状态。对于后一种情况，你实际上有了两个独立的计数器，所以它们需要各自的数据存储。`GetEnumerator()` 负责初始化新的迭代器，然后把它准备好返回。线程安全那一层是为了防止两个不同的线程同时各自调用 `GetEnumerator()`，结果都拿到同一个迭代器（也就是 `this`）。

这就是实现 `IEnumerable<T>` 时的基本模式：编译器在同一个类里实现所有接口，需要的时候再惰性地创建额外的迭代器。我们会看到，涉及参数时还有更多工作要做，但基本原则是一样的。

### 该返回哪个接口

通常来说，`IEnumerable<T>` 是最灵活的返回接口。如果你的迭代器块不改变任何东西，而且你的类本身没有实现 `IEnumerable<T>`（那种情况下，你的 `GetEnumerator()` 方法当然*必须*返回 `IEnumerator<T>`），那它就是个好选择。它让调用方可以用 `foreach`、可以多次迭代、可以用 LINQ to Objects，好处多多。用泛型接口而不是非泛型接口绝对值得。从这里开始，我在正文里只会提非泛型接口，但每次都同时指两种形式。（换句话说，`IEnumerable` 和 `IEnumerator` 之间有重要的区别，但从现在起，我不再区分 `IEnumerable` 和 `IEnumerable<T>`。）

## 状态管理

迭代器类型需要跟踪的状态最多有 x 块：

-   它的“虚拟指令指针”（即它执行到哪儿了）
-   局部变量
-   参数的初始值和 `this`
-   创建它的线程（如上所示，只在 `IEnumerable` 的情形下存在；这个我不再展开）
-   最后产出的值（即 `Current`；这个太琐碎，不值得单独关注）

我们依次看前三项。

### 记录执行到哪儿了

状态机里的第一块状态，用来记录原始源码中已经执行了多少代码。如果你把它想成普通的状态机图（带圆圈和线的那种），那它就是“我们当前在哪个圈里”。很多时候它就被简称为状态——确实，在我们目前看到的示例反编译输出里，它就是 `<>1__state`。（这挺不幸的，因为其余所有数据其实也是状态，不过算了……）规范里提到了*之前*、*运行中*、*挂起*和*之后*这几种状态，但正如我们会看到的，*挂起*还需要更细致的信息——而且对 `IEnumerable` 实现来说，我们还需要一个额外的状态。

在继续之前，值得记住：迭代器块并不是从头跑到尾就完了。方法最初被调用时，只是创建了迭代器。只有在调用 `MoveNext()` 时（如果是用 `IEnumerable`，则是在调用 `GetEnumerator()` 之后），才会开始执行。到那时，执行从方法顶部正常开始，一直进行到第一个 `yield return` 或 `yield break` 语句，或者方法末尾。到那时，会返回一个布尔值，表示这个块是否已经结束迭代。如果/当 `MoveNext()` 再次被调用时，方法从 `yield return` 语句之后紧接着的位置继续执行。（如果上一次调用是因其他原因结束的，那我们就已经完成迭代了，什么都不会发生。）在不看生成代码的情况下，我们写一个小程序来单步走过一个简单的迭代器。代码如下：

```C#
using System;
using System.Collections.Generic;

class Test
{
    static readonly string Padding = new string(' ', 30);
    
    static IEnumerator<int> GetNumbers()
    {
        Console.WriteLine(Padding + "First line of GetNumbers()");
        Console.WriteLine(Padding + "Just before yield return 0");
        yield return 10;
        Console.WriteLine(Padding + "Just after yield return 0");

        Console.WriteLine(Padding + "Just before yield return 1");
        yield return 20;
        Console.WriteLine(Padding + "Just after yield return 1");
    }
    
    static void Main()
    {
        Console.WriteLine("Calling GetNumbers()");
        IEnumerator<int> iterator = GetNumbers();
        Console.WriteLine("Calling MoveNext()...");
        bool more = iterator.MoveNext();
        Console.WriteLine("Result={0}; Current={1}", more, iterator.Current);
        
        Console.WriteLine("Calling MoveNext() again...");
        more = iterator.MoveNext();
        Console.WriteLine("Result={0}; Current={1}", more, iterator.Current);

        Console.WriteLine("Calling MoveNext() again...");
        more = iterator.MoveNext();
        Console.WriteLine("Result={0} (stopping)", more);
    }
}
```

我给迭代器块里产生的输出加了一些填充空格，好让结果更清楚。左边的行来自调用代码，右边的行来自迭代器块内部：

```
Calling GetNumbers()
Calling MoveNext()...
                              First line of GetNumbers()
                              Just before yield return 0
Result=True; Current=10
Calling MoveNext() again...
                              Just after yield return 0
                              Just before yield return 1
Result=True; Current=20
Calling MoveNext() again...
                              Just after yield return 1
Result=False (stopping)
```

现在来介绍 `<>1__state` 可以取的各个值及其含义：

-   \-2：（仅 `IEnumerable`）创建线程首次调用 `GetEnumerator()` 之前
-   \-1：“运行中”——迭代器当前正在执行代码；也用于“之后”——迭代器已经结束，无论是走到了方法末尾还是碰到了 `yield break`
-   0：“之前”——`MoveNext()` 还没被调用过
-   任何正数：表示从哪里恢复执行；它已经产出了至少一个值，而且可能还有后续。正数状态也用于代码仍在运行、但处在一个带有对应 `finally` 块的 `try` 块内部的情况。后面我们会看到为什么。

有意思的是，生成的代码并不区分“运行中”和“之后”。其实也没理由区分：如果你在迭代器处于这个状态时调用 `MoveNext()`（这可能是由于它在另一个线程里运行），`MoveNext()` 会立刻返回 `false`。未捕获的异常之后，我们最终也处在这个状态。

既然知道了这些状态的用途，那我们来看看上面那个迭代器的 `MoveNext()` 长什么样。它基本上就是一个 `switch` 语句，根据状态从代码中的某个特定位置开始执行。`MoveNext()` *永远*是这样，唯一的例外是迭代器主体*仅仅*由一个 `yield break` 组成。

```C#
private bool MoveNext()
{
    switch (this.<>1__state)
    {
        case 0:
            this.<>1__state = -1;
            Console.WriteLine(Test.Padding + "First line of GetNumbers()");
            Console.WriteLine(Test.Padding + "Just before yield return 0");
            this.<>2__current = 10;
            this.<>1__state = 1;
            return true;

        case 1:
            this.<>1__state = -1;
            Console.WriteLine(Test.Padding + "Just after yield return 0");
            Console.WriteLine(Test.Padding + "Just before yield return 1");
            this.<>2__current = 20;
            this.<>1__state = 2;
            return true;

        case 2:
            this.<>1__state = -1;
            Console.WriteLine(Test.Padding + "Just after yield return 1");
            break;
    }
    return false;
}
```

当然，这是个非常简单的例子——我们从状态 0 开始，然后是 1，然后是 2，最后是 -1（尽管每次代码执行期间我们会短暂地处在 -1）。再看看我们的第一个例子。原始代码是：

```C#
using System;
using System.Collections;

class Test
{
    static IEnumerator GetCounter()
    {
        for (int count = 0; count < 10; count++)
        {
            yield return count;
        }
    }
}
```

而它的 `MoveNext()` 方法，和我们之前看到的一样：

```C#
private bool MoveNext()
{
    switch (this.<>1__state)
    {
        case 0:
            this.<>1__state = -1;
            this.<count>5__1 = 0;
            while (this.<count>5__1 < 10)
            {
                this.<>2__current = this.<count>5__1;
                this.<>1__state = 1;
                return true;
            Label_004B:
                this.<>1__state = -1;
                this.<count>5__1++;
            }
            break;
         case 1:
            goto Label_004B;
    }
    return false;
}
```

是的，它用 `goto` 语句从一个 case 跳到了另一个 case 的中间。呃。不过别忘了这只是生成的代码。你想想看，`for` 循环和 `while` 循环其实不过是对比较和跳转的漂亮包装而已。只要它能正常工作、性能好，我们并不真的在乎这段代码的可读性有多烂。C# 编译器团队要达到这两个目标，最简单的办法就是用 `switch` 和 `goto` 来建模。

我不打算解释所有各种转换是怎么发生的。后面会看 `finally` 块的处理，这里有个有意思的点：你不能在一个带 `catch` 块的 `try` 块里 yield（无论是 return 还是 break），也不能在任何 `catch` 或 `finally` 块里 yield。重要的是，你*可以*在一个只有 `finally` 块的 `try` 块里 yield。这意味着你仍然可以使用 `using` 语句，这确实非常方便。用各种不同的方式让代码分支和循环，然后观察生成的 `MoveNext()` 方法发生了什么，会是件很有意思的事。不过我没法穷尽地去试，而你可以很容易地做实验。上面这些简单的例子已经展示了原理，以及涉及到的状态。我们接着看下一块状态。

### 局部变量

普通的局部变量在迭代器块里非常简单。它们变成迭代器类型里的实例变量，并且会像普通代码里那样（在同样的位置）被赋上有意义的值。当然，作为实例变量，它们“明确赋值”这个概念已经不再有意义了，但正常的编译规则会阻止你看到它们的默认值（除非你用反射刻意去捣鼓上面描述的那些状态）。所有这些都能在前面那个 `<count>5__1` 变量的例子里看到。

局部变量的性质意味着，创建迭代器实例时不需要关于这些变量本身的任何额外信息——任何初始值都会在代码执行过程中被设置。当然，这个初始值可能依赖于非局部变量，这就引出了最后一种状态。

### 参数与 `this`

用迭代器块实现的方法可以带参数，如果是实例方法，还可以用 `this`。任何对包含迭代器块的那个类型的实例变量的引用，实际上都只是先用 `this`，再从那个引用导航到变量。下面这个例子同时包含了方法参数（`max`）和对实例变量 `min` 的引用——我给实例变量加上了 `this` 限定，好让它更清楚。

```C#
using System;
using System.Collections.Generic;

class Test
{
    int min;
    
    public Test(int min)
    {
        this.min = min;
    }
    
    public IEnumerator<int> GetCounter(int max)
    {
        for (int count = this.min; count < max; count++)
        {
            yield return count;
        }
    }
}
```

注意它返回的是 `IEnumerator` 而不是 `IEnumerable`。在使用参数和 `this` 时，这个区别比在其他情况下更明显，我们很快就会看到。下面是生成代码中有意思的部分：

```C#
internal class Test
{
    private int min;

    public Test(int min)
    {
        this.min = min;
    }

    public IEnumerator<int> GetCounter(int max)
    {
        <GetCounter>d__0 d__ = new <GetCounter>d__0(0);
        d__.<>4__this = this;
        d__.max = max;
        return d__;
    }

    private sealed class <GetCounter>d__0 : IEnumerator<int>, IEnumerator, IDisposable
    {
        private int <>1__state;
        private int <>2__current;
        public Test <>4__this;
        public int <count>5__1;
        public int max;

        public <GetCounter>d__0(int <>1__state)
        {
            this.<>1__state = <>1__state;
        }

        private bool MoveNext()
        {
            switch (this.<>1__state)
            {
                case 0:
                    this.<>1__state = -1;
                    this.<count>5__1 = this.<>4__this.min;
                    while (this.<count>5__1 < this.max)
                    {
                        this.<>2__current = this.<count>5__1;
                        this.<>1__state = 1;
                        return true;
                    Label_0050:
                        this.<>1__state = -1;
                        this.<count>5__1++;
                    }
                    break;

                case 1:
                    goto Label_0050;
            }
            return false;
        }

        // Other methods as normal
    }
}
```

迭代器里多了两个字段。一个就直接叫 `max`，另一个是 `<>4__this`。原始代码访问 `min` 的地方，生成的代码访问 `<>4__this.min`——尽管 `Test.min` 是私有的，它也能这么访问，因为它在嵌套类型里。

有趣且（在我看来）有点反直觉的地方，是这些额外字段的初始化方式。换作我，会把它们作为构造函数参数传进来，把两个都设为私有，`<>4__this` 还会设为 readonly。C# 团队的 Eric Lippert 解释过，负责这件事的代码，和提升闭包捕获变量的代码是同一份——而那些变量*确实*需要是公开的，这样原来的方法才能访问到它们。所以这基本上是个代码复用的问题，而不是有什么隐秘的理由让编译器不能用我偏好的做法。这其实没什么害处，但我觉得这类事情很有意思 :)

碰巧，我们的迭代器块并不会改变 `max` 的值——但它可以改变。现在假设我们返回的不是 `IEnumerator` 而是 `IEnumerable`。既然我们希望每次调用 `GetEnumerator()` 生成的迭代器都使用 `max` 的原始值，编译器是怎么保证这一点的？下面是生成代码中有意思的那部分（源码和之前一样，只是改了返回类型）。

```C#
internal class Test
{
    private int min;

    public IEnumerable<int> GetCounter(int max)
    {
        <GetCounter>d__0 d__ = new <GetCounter>d__0(-2);
        d__.<>4__this = this;
        d__.<>3__max = max;
        return d__;
    }

    private sealed class <GetCounter>d__0 : IEnumerable<int>, IEnumerable, IEnumerator<int>, IEnumerator, IDisposable
    {
        private int <>1__state;
        private int <>2__current;
        public int <>3__max;
        public Test <>4__this;
        private int <>l__initialThreadId;
        public int <count>5__1;
        public int max;

        public <GetCounter>d__0(int <>1__state)
        {
            this.<>1__state = <>1__state;
            this.<>l__initialThreadId = Thread.CurrentThread.ManagedThreadId;
        }

        private bool MoveNext()
        {
            switch (this.<>1__state)
            {
                case 0:
                    this.<>1__state = -1;
                    this.<count>5__1 = this.<>4__this.min;
                    while (this.<count>5__1 < this.max)
                    {
                        this.<>2__current = this.<count>5__1;
                        this.<>1__state = 1;
                        return true;
                    Label_0050:
                        this.<>1__state = -1;
                        this.<count>5__1++;
                    }
                    break;

                case 1:
                    goto Label_0050;
            }
            return false;
        }

        IEnumerator<int> IEnumerable<int>.GetEnumerator()
        {
            Test.<GetCounter>d__0 d__;
            if ((Thread.CurrentThread.ManagedThreadId == this.<>l__initialThreadId) && (this.<>1__state == -2))
            {
                this.<>1__state = 0;
                d__ = this;
            }
            else
            {
                d__ = new Test.<GetCounter>d__0(0);
                d__.<>4__this = this.<>4__this;
            }
            d__.max = this.<>3__max;
            return d__;
        }
    }
}
```

现在我们又多了*一个*额外字段（`<>3__max`），用来表示 `max` 参数的原始值。每次我们开始把一个实例当作 `IEnumerator` 来用（也就是状态变成 0，无论是构造时还是之后），就用那个值来初始化 `max` 字段。注意我们不需要为 `<>4__this` 再准备一个额外字段，因为对于引用类型来说 `this` 是 readonly 的，原始代码不可能改变它。（出现在结构体里、并且引用了 `this` 的迭代器块，*确实*会为 `this` 的初始值准备一个额外字段，因为迭代器块代码可能改变它。）

按理说，编译器可以检查没有任何东西改变参数的值，从而避免这次复制，但我怀疑那会得不偿失，还会带来各种奇怪的边角情况。现在的这套机制允许你以各种稀奇古怪的方式改变参数值，而不会给同一个 `IEnumerable` 实例创建的其他迭代器带来任何问题。

到此为止，我们需要跟踪的所有状态都讲完了，但还有一个问题要处理：`finally` 块。

## 还有 `finally`……

迭代器带来一个尴尬的问题。方法不再是在栈帧弹出之前整个执行完，而是每次产出一个值时，执行就有效地暂停了。你没法保证调用方之后还会以任何形式再次使用这个迭代器。如果你要求某些代码在值产出之后的某个时刻被执行，那你就麻烦了：你无法保证它一定会发生。直奔主题地说，`finally` 块里的代码通常几乎在任何情况下都会在离开方法之前执行，但在迭代器这里，你不能那么指望它。

值得记住的是，代码里大多数 `finally` 块并不是在 C# 中显式写出来的——它们是编译器作为 `lock` 和 `using` 语句的一部分生成的。`lock` 在迭代器块里尤其危险——只要你在 `lock` 块里写了 `yield return`，就埋下了一个线程问题。即便已经产出了下一个值，你的代码仍然持有那把锁——而谁知道客户端要过多久才会调用 `MoveNext()` 或 `Dispose()`？同样，任何用于安全等关键事务的 `try/finally` 块都不应该出现在迭代器块里：如果客户端不需要更多值了，它可以故意让 `finally` 块不执行。

不过，状态机的设计保证了迭代器在被正确使用时 `finally` 块*确实*会执行。这是因为 `IEnumerator<T>` 实现了 `IDisposable`，而 C# 的 `foreach` 循环会调用迭代器的 `Dispose`（即便是非泛型的 `IEnumerator`，只要它实现了 `IDisposable`）。生成的迭代器里的 `IDisposable` 实现，会根据当前位置（一如既往地基于状态）判断哪些 `finally` 块是相关的，并执行相应的代码。

这次我不再给一个不切实际的例子，而是展示我最喜欢的迭代器块用法之一。这个类很简单，但非常好用。它让你可以逐行遍历一个文本文件（或任何其他 `TextReader`），并在迭代器结束或被释放时关闭读取器。[MiscUtil](https://jonskeet.uk/csharp/miscutil) 里有一个功能更完整的版本，但差别只是构造实例的方式更多。

```C#
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;

public sealed class LineReader : IEnumerable<string>
{
    readonly Func<TextReader> dataSource;

    public LineReader(string filename)
        : this(() => File.OpenText(filename))
    {
    }

    public LineReader(Func<TextReader> dataSource)
    {
        this.dataSource = dataSource;
    }

    public IEnumerator<string> GetEnumerator()
    {
        using (TextReader reader = dataSource())
        {
            string line;
            while ((line = reader.ReadLine()) != null)
            {
                yield return line;
            }
        }
    }


    IEnumerator IEnumerable.GetEnumerator()
    {
        return GetEnumerator();
    }
}
```

有了 `LineReader`，逐行输出一个文本文件就这么简单：

```C#
foreach (string line in new LineReader(filename))
  {
      Console.WriteLine(line);
  }
```

更进一步，你还可以用 LINQ 标准查询运算符来做过滤、投影等等。不过重要的是，一旦我们完成迭代就要尽快关闭文件——无论是因为读到了文件末尾、抛出了异常，还是只是觉得读够了。下面是 `LineReader` 生成的迭代器类中有意思的部分：

```C#
private sealed class <GetEnumerator>d__3 : IEnumerator<string>, IEnumerator, IDisposable
{
    private int <>1__state;
    private string <>2__current;
    public LineReader <>4__this;
    public string <line>5__5;
    public TextReader <reader>5__4;

    private void <>m__Finally6()
    {
        this.<>1__state = -1;
        if (this.<reader>5__4 != null)
        {
            this.<reader>5__4.Dispose();
        }
    }

    private bool MoveNext()
    {
        try
        {
            switch (this.<>1__state)
            {
                case 0:
                    this.<>1__state = -1;
                    this.<reader>5__4 = this.<>4__this.dataSource();
                    this.<>1__state = 1;
                    while ((this.<line>5__5 = this.<reader>5__4.ReadLine()) != null)
                    {
                        this.<>2__current = this.<line>5__5;
                        this.<>1__state = 2;
                        return true;
                    Label_0061:
                        this.<>1__state = 1;
                    }
                    this.<>m__Finally6();
                    break;

                case 2:
                    goto Label_0061;
            }
            return false;
        }
        // Note "fault" not "finally"
        fault
        {
            this.System.IDisposable.Dispose();
        }
    }

    void IDisposable.Dispose()
    {
        switch (this.<>1__state)
        {
            case 1:
            case 2:
                break;

            // Very strange! Reflector bug? See below.
            default:
                break;
                try
                {
                }
                finally
                {
                    this.<>m__Finally6();
                }
                break;
        }
    }
    
    // Other stuff: Reset, Current, constructor etc.
}
```

这里有不少值得注意的有意思之处：

-   我们多了一个方法 `<>m__Finally6`，它同时被 `Dispose()` 和 `MoveNext()` 调用。它包含 `finally` 块里的代码（来自原始源码的 `using` 语句），并把状态设为“运行中/之后”。编译器会记录：如果迭代器在某个特定状态下被释放，需要调用哪些 `finally` 块，然后在 `Dispose()` 方法里调用它们。
-   对于迭代器块本身抛出异常的情况，还有额外的保护。在这种情况下，迭代器会被释放，实际上就变得无效了。这是由生成代码中的 `fault` 块处理的。就跟那些“不可言说”的生成名字一样，这是在真正的 C# 里做不到的事情，但它在 IL 里是个 `fault` 处理程序。它类似于 `finally`，但相应的 `try` 块正常进入时不会触发。你可以把它想成有点像是一个万能的 `catch` 块，在末尾把异常重新抛出。
-   有一个正数状态，甚至在我们运行期间也会用到。稍作实验后发现，似乎每个包含 `yield return` 语句的 `try` 块都会生成一个额外的状态。我不太确定这些额外状态的用途是什么，但想必是为了在特定情形下更容易做正确的事。`yield break` 语句会导致在方法返回之前执行 `Dispose()`。
-   `Dispose` 里的 `try/finally` 块非常古怪。我怀疑这是 Reflector 的一个 bug，那个 `break` 其实应该在 `block` 里。我不太清楚为什么它不直接发起调用，不过大概有它的理由。

同样，如果你动手实验，还能发现更多东西，但你已经能看到：编译器在尽力确保原始迭代器块里的 `finally` 块尽可能忠实地执行。

## 小结

呼！这篇文章比我预想的要长得多。迭代器块里要照顾的可能性和小怪癖太多了，我很高兴这件事是 C# 团队去把它们全部搞对，而不是我。如你所见，Reflector 是观察底层究竟发生了什么的绝佳工具，但你要意识到，C# 编译器会生成一些在 C# 里没有*直接*对应物的代码，比如最后一个例子里的 fault 处理程序。

手写迭代器和使用迭代器块来写，差别是巨大的。用迭代器块实现 LINQ to Objects 的很多功能都相当容易，尽管[在合适的时机检查参数确实很棘手](http://codeblog.jonskeet.uk/2008/03/02/c-4-idea-iterator-blocks-and-parameter-checking)。而手写同样的功能会极其痛苦且容易出错。说 [LINQBridge](http://www.albahari.com/nutshell/linqbridge.html) 这类产品离了迭代器块大概就不存在了，我觉得这不算夸张；我确信 [MiscUtil](https://jonskeet.uk/csharp/miscutil) 里很多与迭代器相关的代码离了它也不存在。

所以，向 C# 团队致以大大的“谢谢”，我也期待看到他们还能帮我消灭哪些繁琐的活儿。

> 本文是对[Iterator block implementation details: auto-generated state machines](https://csharpindepth.com/articles/IteratorBlockImplementation)这篇文章的翻译，作者是著有[C# in Depth](https://csharpindepth.com/)的大神[Jon Skeet](https://jonskeet.uk/)。非文章原文或本人对某段文字理解，会以斜体 *个人理解：xxx* 进行标注。本人翻译能力有限，强烈建议大家去看原版！
