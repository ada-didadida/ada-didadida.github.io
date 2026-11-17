---
title: 方法重载
date: 2024-01-24 11:18:48
tags:
  - - C#
  - - Overloading
  - - 翻译
categories:
  - - C#
  - - 翻译
top_img: /images/covers/overloading.png
---

*方法重载*是指你有两个相同名称但不同签名的方法。在*编译*时，编译器会根据方法调用的目标和参数的编译时类型来决定要调用哪一个方法。（假设你没有使用 `dynamic`，这会使情况稍微复杂一些。）
<!--more-->
现在，有时在解析重载时会有点混乱...特别是不同版本的变化可能会有不同的情况。这篇文章会指出*一些*你可能遇到的陷阱...但这篇文章不是关于如何执行重载的权威指南。要了解相关内容，请自行了解相应的规范——但要知道，您可能会迷失在一些相当复杂的主题中。重载与类型推断和隐式转换（包括lambda表达式、匿名方法和方法组，都是些棘手的问题）会相互作用。所有规范引用均来自 C# 4 规范。

这篇文章也不会讨论使用重载时的设计选择是否合适。我会给出一些关于何时使用重载的建议，但有些建议可能非常令人困惑，除此之外的其他事项都留待以后讨论。我认为*通常情况下*重载应该是为了方便而使用的，通常所有重载最终都会调用一个“主要”方法。（*个人理解：“主要”方法即指拥有相同的名称*）虽然并不总是如此，但我相信这是最常见、最适当的使用场景了。

在每个示例中，我都会给出一个简短的程序，它会声明一些方法并调用其中一个——然后我会解释在 C# 的不同版本中调用了哪个，以及为什么。由于本文并不关注设计决策，仅仅只是说明 C# 编译器会做出的机械选择，所以我没有让示例实现任何实际的功能，甚至没有给它们起个有意义的名称：重载的方法总是叫做 `Foo`，它只是输出自己的签名。当然方法执行的内容是无关紧要的，但如果你想获取代码并试验它，这会使事情变得更加容易。

## 简单案例

让我们从几个非常简单的案例开始，只是为了进入状态。首先，是只有一次重载的简单情况。

```C#
using System;

class Test
{
    static void Foo(int x)
    {
        Console.WriteLine("Foo(int x)");
    }

    static void Foo(string y)
    {
        Console.WriteLine("Foo(string y)");
    }

    static void Main()
    {
        Foo("text");
    }
}
```

这段代码会输出 `Foo(string y)`——从 `string`类型（案例中的参数类型“text”）到 `int` 类型没有隐式转换，所以第一个方法在规范术语中（第 7.5.3.1 节）不是一个*适用的函数成员*。在决定要调用哪个方法时，重载会忽略所有不正确的方法。

让我们给编译器一些思考的情况...

```C#
using System;

class Test
{
    static void Foo(int x)
    {
        Console.WriteLine("Foo(int x)");
    }

    static void Foo(double y)
    {
        Console.WriteLine("Foo(double y)");
    }

    static void Main()
    {
        Foo(10);
    }
}
```

这次，会输出 `Foo(int x)`。两种方法都是适用的——如果我们移除接受 `int` 的方法，接受 `double` 的方法将会被调用。编译器根据*更合适的函数成员*规则（第 7.5.3.2 节）决定选择哪一个，该规则考虑了（在其他事物中）每个参数到相应参数类型的转换（第一个方法是 `int`，第二个是 `double`）。还有更多规则（第 7.5.3.3 节）来说明哪种转换更好——在这种情况下，从 `int` 类型表达式到 `int` 的转换比从 `int` 到 `double` 的转换更好，所以第一个方法“胜出”。

## 多个参数

当涉及到多个参数时，为了让一个方法“击败”另一个，每个参数*至少*在选择时适配性要一致，并且至少在某个参数上适配性要*更高*。这要通过逐个方法比较来实现的：一个方法并不需要在任何单个参数上都比*所有*其他方法好。（*个人理解：翻译起来怪怪的，能力有限，直接看例子会比较好理解* ）例如：

```C#
using System;

class Test
{
    static void Foo(int x, int y)
    {
        Console.WriteLine("Foo(int x, int y)");
    }

    static void Foo(int x, double y)
    {
        Console.WriteLine("Foo(int x, double y)");
    }

    static void Foo(double x, int y)
    {
        Console.WriteLine("Foo(double x, int y)");
    }

    static void Main()
    {
        Foo(5, 10);
    }
}
```

这个例子中第一个方法 (`Foo(int x, int y)`) 获胜，因为它在第二个参数（y）上比第二个方法好，在第一个参数（x）上比第三个方法好。

如果没有方法明确胜出，编译器会抛出错误：

```C#
using System;

class Test
{
    static void Foo(int x, double y)
    {
        Console.WriteLine("Foo(int x, double y)");
    }

    static void Foo(double x, int y)
    {
        Console.WriteLine("Foo(double x, int y)");
    }

    static void Main()
    {
        Foo(5, 10);
    }
}
```

结果：

```
error CS0121: The call is ambiguous between the following methods or
properties: 'Test.Foo(int, double)' and 'Test.Foo(double, int)'
```

## 继承

继承可能会令人感到困惑。当编译器寻找某个实例的方法重载时，会先考虑方法调用的*目标的*编译时类别，并查看那里声明的方法。如果找不到合适的方法，它会再查看父类...然后是祖父类等等。这意味着如果在继承关系层级中有两个方法，那么“更深”的那个将首先被选择，即使它对于调用来说不是“更好的函数成员”。这里有一个相当简单的例子：

```C#
using System;

class Parent
{
    public void Foo(int x)
    {
        Console.WriteLine("Parent.Foo(int x)");
    }   
}

class Child : Parent
{
    public void Foo(double y)
    {
        Console.WriteLine("Child.Foo(double y)");
    }
}

class Test
{
    static void Main()
    {
        Child c = new Child();
        c.Foo(10);
    }
}
```

方法调用的目标是一个类型为 `Child` 的表达式，因此编译器首先查看 `Child` 类。其中只有一个方法，而且它是可以适用的（从 `int` 到 `double` 有隐式转换），所以它就被选中了。编译器根本不会考虑 `Parent` 方法。

这样做的原因是为了减少*不稳定基类*（brittle base class）问题的风险，即在基类中引入一个新方法时可能会对派生类造成问题。我强烈推荐阅读一下Eric Lippert对此的[一系列相关文章](http://blogs.msdn.com/b/ericlippert/archive/tags/brittle+base+classes/)(原链接失效了，这是译者查到的Eric Lippert[博客地址](https://ericlippert.com/category/brittle-base-classes/)，仅供参考)。

然而，这种情况下有个*特别*令人惊讶的方面是，怎样才算在一个类中“声明”了一个方法呢？答案是，如果你在子类中*重写*了一个基类方法，这并不算是声明。让我们稍微调整一下我们的例子：

```C#
using System;

class Parent
{
    public virtual void Foo(int x)
    {
        Console.WriteLine("Parent.Foo(int x)");
    }   
}

class Child : Parent
{
    public override void Foo(int x)
    {
        Console.WriteLine("Child.Foo(int x)");
    }   

    public void Foo(double y)
    {
        Console.WriteLine("Child.Foo(double y)");
    }
}

class Test
{
    static void Main()
    {
        Child c = new Child();
        c.Foo(10);
    }
}
```

现在*看起来*你是在尝试调用 `Child.Foo(int x)` ——但上面的代码实际上会输出 `Child.Foo(double y)`。**编译器忽略了子类中的重写方法**。

考虑到这种奇怪的情况，我的建议是**避免跨继承边界重载**...尤其是对于那些在简化层级后可能有多种方法适用于同一调用的情况。另外，值得高兴的是，本文其余示例将不会涉及继承。

## 返回类型

方法的返回类型并不会被视为方法签名的一部分（第 3.6 节），并且编译器在检查方法调用的更广泛上下文中返回类型是否会引起错误之前，就已经决定了是否进行重载。换句话说，返回类型不是用于判断一个函数成员是否适用的标准。例如：

```C#
using System;

class Test
{
    static string Foo(int x)
    {
        Console.WriteLine("Foo(int x)");
        return "";
    }

    static Guid Foo(double y)
    {
        Console.WriteLine("Foo(double y)");
        return Guid.Empty;
    }

    static void Main()
    {
        Guid guid = Foo(10);
    }
}
```

这个例子中，编译器选择了 `string Foo(int x)` 的重载，然后编译器发现它不能将 `string` 赋值给类型为 `Guid` 的变量。单独来看，`Guid Foo(double y)` 无疑更合适，但由于另一个方法在参数转换方面更合适，它也就失去了机会。

## 可选参数

C# 4 引入的可选参数允许方法为部分或所有参数声明默认值。如果调用者对默认值感到满意，他们可以选择不传递相关的参数。这会影响到重载的解析，因为可能有多种方法具有不同数量的参数，并且他们都是适用的。当面临选择一个需要编译器填充可选参数值的方法和一个不需要这样做的方法时，如果方法在其他方面“平分秋色”（即正常参数转换没有决定胜者），重载解析将选择调用者明确指定了所有参数的那个方法：

```C#
using System;

class Test
{
    static void Foo(int x, int y = 5)
    {
        Console.WriteLine("Foo(int x, int y = 5)");
    }

    static void Foo(int x)
    {
        Console.WriteLine("Foo(int x)");
    }

    static void Main()
    {
        Foo(10);
    }
}
```

在考虑第一个方法时，编译器需要使用默认值填充 `y` 参数的参数值——而第二个方法不需要这样做。因此输出结果是 `Foo(int x)`。请注意，这是一个纯粹的是/否决策：如果两种方法都需要填充默认值，并且在其他方面平分秋色，编译器将抛出错误：

```C#
using System;

class Test
{
    static void Foo(int x, int y = 5, int z = 10)
    {
        Console.WriteLine("Foo(int x, int y = 5, int z = 10)");
    }

    static void Foo(int x, int y = 5)
    {
        Console.WriteLine("Foo(int x, int y = 5)");
    }

    static void Main()
    {
        Foo(10);
    }
}
```

这个调用是有歧义的，因为已给出的一个参数对两种方法都适用，而且两种方法都需要额外的参数，这些参数将从默认值中填充。第一种方法需要两个参数默认值，第二种只需要一个，当然这一点其实并不重要。

这里澄清一下，只有在按照 C# 4 版本之前的规则进行比较后，我们才会使用这种打破平局的方法。所以，我们稍微修改一下之前的例子：

```C#
using System;

class Test
{
    static void Foo(int x, int y = 5)
    {
        Console.WriteLine("Foo(int x, int y = 5)");
    }

    static void Foo(double x)
    {
        Console.WriteLine("Foo(double x)");
    }

    static void Main()
    {
        Foo(10);
    }
}
```

这次使用了带有可选参数的方法，因为 `int` 到 `int` 的转换比 `int` 到 `double` 的转换更合适。

## 命名参数

命名参数，这是 C# 4 引入的又一特性，它能有效地缩减适用的函数成员集合，方法是排除那些参数名“不符”的成员。这里对一个早期的简单示例进行了修改——我只是在*调用*代码中指定了一个参数名。

```C#
using System;

class Test
{
    static void Foo(int x)
    {
        Console.WriteLine("Foo(int x)");
    }

    static void Foo(double y)
    {
        Console.WriteLine("Foo(double y)");
    }

    static void Main()
    {
        Foo(y: 10);
    }
}
```

这次第一个方法就不适用了，因为没有 `y` 参数...所以第二种方法被调用，输出结果是 `Foo(double y)`。显然，这种技巧只有在方法中的参数具有不同名称时才生效。

## 引入新的转换机制将导致重大变革

有时，语言的演变会引入一种全新的转换方式。这种变化具有颠覆性，因为它意味着原本不适用的函数成员重载现在可能变得适用了。即使这种新转换并非优于现有的重载方法——假如你的子类中有一个之前不适用的方法变得适用，那么这个方法将会优先于基类中的任何方法，就像我们已经见过的那样。

在 C# 2 中，这种情况发生在委托上——你突然可以通过一个签名为 `void Foo(object sender, EventArgs e)` 的方法来构建一个 `MouseEventHandler` 实例，而这在 C# 1 中是不被允许的。

到了 C# 4，出现了一种更广泛应用的新转换方式：泛型的协变和逆变。这里有一个例子：

```C#
using System;
using System.Collections.Generic;

class Test
{
    static void Foo(object x)
    {
        Console.WriteLine("Foo(object x)");
    }

    static void Foo(IEnumerable<object> y)
    {
        Console.WriteLine("Foo(IEnumerable<object> y)");
    }

    static void Main()
    {
        List<string> strings = new List<string>();
        Foo(strings);
    }
}
```

C# 3 编译器会选择 `Foo(object x)` 的重载。C# 4 编译器在面向 .NET 3.5 时会选择同样的重载——因为在 .NET 3.5 中 `IEnumerable<T>` 不是协变的。当面向 .NET 4 时，C# 4 编译器将选择 `Foo(IEnumerable<T>)` 的重载，因为转换到 `(IEnumerable<T>)` 比转换到 `object` 更适用。这种变化不会触发任何警告。

## 结论

这篇文章在未来可能会持续增加内容，涵盖更多编程特性的细节（比如 params 参数等）。目前为止，我希望已经提供了足够的思考点。方法重载是一个充满复杂规则的领域，这些规则有时会以不可预知的方式相互影响。虽然在某些情况下重载确实很有用，但我通常发现创建具有明确名称的替代方法更为有效。这在构造函数的设计中尤为重要，特别是当你需要声明两个具有*相同签名*的构造函数时：这种情况下，你可以创建两个静态方法来生成实例，这两个方法都会调用一个更具体的构造函数（可能有两个参数）。当然，静态工厂方法与公开构造函数之间的选择是另一个讨论话题。

当只存在一个可用方法时，重载通常不会引起大问题——例如当参数类型相互不兼容（例如，一种方法接受 `int`，另一种接受 `string`）或一个方法的参数多于另一个。但即使如此，也需谨慎使用：特别要注意的是，一个类型可能实现多个接口，甚至可能多次用不同的类型参数实现同一泛型接口。

如果你在确定哪个方法将被调用时必须参考规范，而这些方法又*在你的控制之下*，那么我强烈建议你考虑重新命名一些方法来减少重载的情况。当方法位于继承层次结构中时，这个建议尤其重要，原因前文已有说明。

> 本文是对[Overloading](https://csharpindepth.com/articles/Overloading)这篇文章的翻译，作者是著有[C# in Depth](https://csharpindepth.com/)的大神[Jon Skeet](https://jonskeet.uk/)。非文章原文或本人对某段文字理解，会以斜体 *个人理解：xxx* 进行标注。本人翻译能力有限，强烈建议大家去看原版！
