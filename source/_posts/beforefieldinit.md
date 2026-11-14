---
title: C#和beforefieldinit属性
date: 2021-01-11 09:41:54
categories:
 - [C#]
 - [翻译]
tags:
 - [C#]
 - [beforefieldinit]
 - [翻译]
---

你觉得你能准确预测C#初始化发生的时间吗？这可比你想象的要复杂得多...

**请注意，所有结果都是我在C#编译器和CLR的某些（现在还没说明）组合上看到的。你可能会观察到不同的行为，而这些行为仍然遵循规范规定的内容。随着平台和实现的组合越来越多，想要穷尽也没啥意思。**  <!-- more -->

## 静态构造函数和类型初始化器[^1]的区别
[^1]: *个人理解：类型初始化器是指普通的构造函数，这里与静态构造函数作区分*

[单例模式](/2021/01/07/Implementing-the-Singleton-Pattern-in-C/index.html)的一些实现依赖于静态构造函数和类型初始化器的行为，特别是在调用时间方面。

C#规范中规定：

一个类的静态构造函数在给定的应用域中最多执行一次。静态构造函数的执行是由应用域中的下列情况第一次出现时触发的：
- 该类的一个实例被创建。
- 该类的任意一个静态成员被引用。

CLI规范(ECMA 335)在8.9.5节中规定：
1. 一个类可以有一个类型初始化方法，也可以没有
2. 一个类型可以为它的类型初始化方法指定一个宽松语义（relaxed semantic）（为了方便，下文称之为*BeforeFieldInit*）。
3. 如果被标记为*BeforeFieldInit*，那么该类型的初始化方法会在第一次访问该类型的静态字段或者之前的某个时间执行。
4. 如果没有被标记为*BeforeFieldInit*，那么该类型的初始化方法会在下列情况下执行：
   - 首次访问该类型的任何静态或实例字段。
   - 首次调用该类型的任何静态、实例或虚拟方法。

C#规范暗示，任何带有静态构造函数的类型都不应该用*beforefieldinit*标记。事实上，编译器也坚持了这一点，但效果略显怪异。我怀疑很多程序员认为（就像我长期以来做的那样），下列类在语义上是等价的。
```C#
class Test
{
    static object o = new object();
}

class Test
{
    static object o;

    static Test()
    {
        o = new object();
    }
}
```

事实上，这两个类并不相同。它们都有类型初始化器-并且两者一模一样。但是第一个没有静态构造函数，而第二个却有。这就意味着第一个类被标记成了*beforefieldinit*，它的类型初始化器会在其静态字段首次引用前的任何时刻被调用。静态构造函数甚至什么都不用做。下面的第三个类和第二个类一样：
```C#
class Test
{
    static object o = new object();

    static Test()
    {
    }
}
```

我认为这是造成巨大混乱的根源-尤其是在单例的实现方面。

## *beforefieldinit*的奇特性-是否延迟（Lazy）

*beforefieldinit*标志有个奇怪的效果，那就是两个一样的类型初始化器，有*beforefieldinit*标志的要比没有的更早调用-甚至可能会被滞后调用，或者根本不调用。考虑下面的程序：
```C#
using System;

class Test
{
    public static string x = EchoAndReturn ("In type initializer");

    public static string EchoAndReturn (string s)
    {
        Console.WriteLine (s);
        return s;
    }
}

class Driver
{
    public static void Main()
    {
        Console.WriteLine("Starting Main");
        // Invoke a static method on Test
        Test.EchoAndReturn("Echo!");
        Console.WriteLine("After echo");
        // Reference a static field in Test
        string y = Test.x;
        // Use the value just to avoid compiler cleverness
        if (y != null)
        {
            Console.WriteLine("After field access");
        }
    }
}
```

上述程序的会有多种运行结果。运行时可能会在加载程序集时运行类型初始化器：
```
In type initializer
Starting Main
Echo!
After echo
After field access
```

也可能在静态方法第一次运行时运行...
```
Starting Main
In type initializer
Echo!
After echo
After field access
```

甚至等到第一次访问字段时运行...
```
Starting Main
Echo!
After echo
In type initializer
After field access
```

（理论上，类型初始化器甚至可能在“Echo！”后，“After Echo”前运行。不过，如果有任何运行时真的出现这种行为，也是很让我惊讶了。）在`Test`中使用静态构造函数，只会出现中间的那种情况，所以*beforefieldinit*可以让类型初始化器延迟调用（相比于最后一种结果）或提前调用（相比于第一种结果）。我猜想即使是那些知道*beforefieldinit*存在的开发者也会对此感到惊讶。MSDN文档对于`TypeAttributes.BeforeFieldInit`的介绍很少。它是这样描述这个标志的：

**规定调用类型的静态构造函数不会强制系统初始化该类型。**

虽然在严格意义上是正确的，但这肯定不完整-它表明*beforefieldinit*标志只会让初始化延迟，而不是提前。

值得注意的是，与v1和v2相比，v4 CLR的表现是不同-它们都符合规范，但是v4 CLR在很多情况下是真正的延迟，早期版本却会更急切。

## 该怎么做呢？

我提出以下修改意见：
- 静态字段初始化器应该被视为静态构造函数的一部分。换句话说，任何具有静态初始化器或显式静态构造函数的类型都不应该（默认情况下）被标记为beforefieldinit。(对C#语言规范的修改。)
- 在代码中应该有一种方法可以覆盖这种默认行为。添加一个属性将是一个非常合理的解决方案。(修改C#语言规范，在标准库中增加一个属性。)
- `TypeAttributes.BeforeFieldInit`的文档应当对其行为描述清晰。(对MSDN文件和ECMA 335的修改)

以上改动都是完全向后兼容的，不需要修改CLI。

## 进一步的想法（在与新闻组讨论后）

上述建议中，第一个建议肯定是最有争议的。(据我所知，最后一项根本没有争议)。原因是性能问题。其实没有多少类需要C#程序员去做这种假设的行为-事实上大多数人永远都不需要知道其中的区别。然而，JIT编译器会十分在意：比如说，如果在一个相当频繁的循环中使用了静态成员，那么在进入循环前就初始化类型是很有意义的，这样之后就知道类型已经初始化了。当代码在应用、作用域之间共享时，我认为这一点这会变得更重要。

使用新版本框架重新编译现有代码导致性能下降，无疑是不受欢迎的。因此，我愿意为此不太理想的建议让步-事实上，我只是处于历史的考虑，才把它留在这一页（我不喜欢做修正主义者）。

不过，第二个建议还是很重要的-既可以让明确需要静态构造函数的类在适当情况下使用BeforeFieldInit语义提高性能，也可以让目前只需要静态构造函数的类摆脱BeforeFieldInit语义，以更自我记录的方式达到目的。（一个初级开发人员更有可能删除一个看似没有操作的静态构造函数，而不是删除一个他们不完全理解的属性。）

> 本文是对[C# and beforefieldinit](https://csharpindepth.com/articles/BeforeFieldInit)这篇文章的翻译，作者是著有[C# in Depth](https://csharpindepth.com/)的大神[Jon Skeet](https://jonskeet.uk/)。非文章原文或本人对某段文字理解，会以斜体 *个人理解：xxx* 进行标注。本人翻译能力有限，强烈建议大家去看原版！