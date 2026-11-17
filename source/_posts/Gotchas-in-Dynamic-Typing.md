---
title: 动态类型中的陷阱
date: 2026-11-17 11:50:00
tags:
  - - C#
  - - dynamic
  - - 翻译
categories:
  - - C#
  - - 翻译
top_img: /images/covers/dynamic-gotchas.png
---

C# 的 `dynamic` 支持很棒，但有些刁钻的地方值得了解，因为它们很容易把你绊一跤。如果你自己也遇到了，请[写信告诉我](mailto:skeet@pobox.com)，我会把它们加进这个清单。<!--more-->

## 显式接口实现

要记住：当执行时编译器处理一个动态表达式时，它考虑的是对象的*实际*类型，而不是你原本可能掌握的其他信息。（实际上还要*稍微*复杂一点，因为对象可能是调用代码根本不了解的类型。编译器会算出“最佳可访问类型”并据此行事，但大多数时候你不需要操心这一点。）它的行为就像你声明了一个该类型的变量，然后走正常的步骤去判断该走哪条执行路径。

这通常没问题，但它和显式接口实现配合得不好。如果你还记得，显式接口实现只允许你通过接口类型的表达式来调用被实现的成员。假定实际实现类型是可访问的，这就意味着执行时编译器找不到相关成员。下面是书里那个例子，我稍微改了一下：

```C#
static void PrintCount(ICollection collection)
{
    dynamic d = collection;
    Console.WriteLine("Static typing: {0}", collection.Count);
    Console.WriteLine("Dynamic typing: {0}", d.Count);
}
...
PrintCount(new int[10]);
```

我们确知这个类型有某种 `Count` 属性，因为它实现了 `ICollection`——方法的第二行表明，在静态类型下我们知道那个属性。然而，当我们用一个数组调用这个方法时，它用静态类型的属性打印出了计数，然后就抛异常了：

```
Unhandled Exception: Microsoft.CSharp.RuntimeBinder.RuntimeBinderException:
'System.Array' does not contain a definition for 'Count'
```

这是因为 `System.Array` 是以*显式*方式实现 `ICollection.Count` 属性的。如果我们在*编译*期试图通过一个 `Array` 类型的表达式使用这个属性，会遇到同样的问题——比如把 `collection` 参数的类型改掉：

```
Test.cs(9,60): error CS1061: 'System.Array' does not contain a definition for
        'Count' and no extension method 'Count' accepting a first argument of
        type 'System.Array' could be found (are you missing a using directive or
        an assembly reference?)
```

执行时编译器做的正是我们*应该*预期它会做的事——只是同时也让人有点恼火。这算是正常的 C# 类型系统与动态类型之间的一种阻抗不匹配。

## 重载歧义

避开显式接口实现问题的一个办法，是用动态类型来做执行时的重载解析，从而找出最具体的那个方法——然后它内部再用*静态*类型。同样，书里也有个例子，想办法高效地求一个序列的长度。然而，即便是书里那个例子也有个阴险的问题——编译器并不总是知道该选哪个重载。它能应付显式接口实现……但即便只是用数组做同样简单的尝试，也会失败，很遗憾：

```C#
private static int CountImpl<T>(ICollection<T> collection)
{
    return collection.Count;
}
    
private static int CountImpl(ICollection collection)
{
    return collection.Count;
}
        
public static void PrintCount(IEnumerable collection)
{
    dynamic d = collection;
    int count = CountImpl(d);
    Console.WriteLine(count);
}
...
PrintCount(new int[10]);
```

这里 `int[]` 同时实现了 `ICollection` 和 `ICollection<int>`——所以我们在执行时会得到下面这个错误：

```
Unhandled Exception: Microsoft.CSharp.RuntimeBinder.RuntimeBinderException:
The call is ambiguous between the following methods or properties:
'Test.CountImpl(System.Collections.Generic.ICollection)' and 
'Test.CountImpl(System.Collections.ICollection)'
```

*确实*有办法绕过去，用上一些[重载的怪癖](https://csharpindepth.com/articles/Overloading)（[译文](/2024/01/24/Overloading/)）就行——但那不是什么好受的活。

只要有可能，就让重载参数用具体的类——这样你踩到重载歧义的机会就会小得多。另外要注意，就调用代码而言，类型为 `dynamic` 的参数和类型为 `object` 的参数是等价的。

最后，记住：当用作实参的动态表达式的值为 `null` 时，重载解析大致等价于直接传入字面量 `null` 作为实参……编译器没有其他类型信息可以帮它判断你想要什么，所以你很容易就掉进歧义里。

## 复合赋值

这个问题是写[动态求和一个序列](https://csharpindepth.com/articles/DynamicSum)（[译文](/2026/11/17/Summing-a-Sequence-Dynamically/)）时把我咬了一口的。C# 语言规范（第 7.17.2 节）把复合赋值运算符描述为两种形式：一种是显而易见的“执行运算，再把结果赋回原变量”（此时运算符的结果能隐式转换为运算符的返回类型）；*或者*（对于没有隐式转换、但有*显式*转换且另外几个条件也成立的情况）同样的做法，只是在赋值前加一次强制转换。正是这一点让下面这样的代码能够编译并运行：

```C#
byte b = 10;
b += 20;
```

记住并不存在 `operator +(byte x, byte y)` 这样的运算符——上面这段代码会把两个操作数提升为 `int`，使用 `operator +(int x, int y)`，然后自动把结果转回 `byte`。这是编译器提供的一个贴心的小便利。

现在考虑下面这段动态代码：

```C#
byte b = 10;
dynamic d = b;
d += 20;
Console.WriteLine(d.GetType());
```

这里的结果应该是什么？嗯，在复合赋值*之前*，`d` 的值毫无疑问是 `byte`……所以你可能会期望 C# 编译器的行为是一样的。确实，在 .NET 4 的一些 beta 版本里，它就是这么工作的。然而，据说这在别处引发了一些问题，所以在正式发布前改成了不执行那次转换——结果就是 `d` 变成了 `int`，于是上面这段代码打印出 `System.Int32`。

我怀疑这个特定的陷阱不会撞上多少开发者，但值得心里有数……在行为改变的时候，它把我彻底搞懵了。

## 匿名类型

你可以在动态类型里使用匿名类型，事实上这在 ASP.NET MVC 里相当常见。然而，你需要知道：用来实现匿名类型的那些“真正的”类型（由编译器生成）是 internal 的。动态类型遵守正常的访问控制规则，所以如果你想从另一个程序集动态地使用某个匿名类型的实例，就需要用 `[InternalsVisibleTo]` 把访问权限从包含该类型的程序集授予使用它的程序集。

## 泛型

动态类型受泛型的限制：尽管你可以把一个 `dynamic` 类型的表达式转换成任何其他（非指针）类型，但当 `dynamic` 作为类型参数出现时就不适用了——`Foo<dynamic>` 这个类型是静态绑定而不是动态绑定的。下面是个 LINQ 的例子，我们对一些数字求平方。我们知道结果实际上会是一个整数列表，于是尝试赋值给 `List<int>`：

```C#
IEnumerable<dynamic> numbers = new dynamic[] { 42 };
List<int> squares = numbers.Select(d => d * d).ToList();
```

这样不行，因为 `ToList` 调用的结果实际上是 `List<dynamic>`，而对 CLR 来说它就是个 `List<object>`。我们必须改为把每个*元素*转换成 `int`，要么在 lambda 表达式里转换，要么用 `Cast` 方法：

```C#
IEnumerable<dynamic> numbers = new dynamic[] { 42 };
List<int> squares = numbers.Select(d => d * d).Cast<int>().ToList();
```

任务（Task）提供了另一个例子：

```C#
private static int Square(int number)
{
    return number * number;
}
 
static void Main(string[] args)
{
    dynamic number = 42;
 
    // Invalid: no conversion from Task<dynamic> to Task<int>
    Task<int> task = Task.Run(() => Square(number));
 
    Task<int> valid = Task.Run(new Func<int>(() => Square(number)));
    Task<int> alsoValid = Task.Run(() => (int)Square(number));
}
```

这里表达式 `Square(number)` 的类型是 `dynamic`，因为几乎所有使用动态值的表达式结果类型都是 `dynamic`。所以第一次调用 `Task.Run` 的返回类型是 `Task<dynamic>`，而它无法转换成 `Task<int>`。

## WCF、`IClientChannel` 与代理

WCF 用 [`RealProxy`](https://msdn.microsoft.com/en-us/library/system.runtime.remoting.proxies.realproxy) 来实现服务代理。相当令人惊讶的是，`RealProxy` *确实*能和 `dynamic` 一起工作，只要调用 `GetType` 能返回正确的类型。WCF 返回的代理同时实现了 [`IClientChannel`](https://msdn.microsoft.com/en-us/library/system.servicemodel.iclientchannel) 和你正在代理的服务 API 接口——但 `GetType` 只返回 API 接口。所以如果你试图通过一个动态值去调用 `IClientChannel` 的任何一个成员，它就会失败。这和显式接口实现类似——就好像代理是以显式方式实现 `IClientChannel` 的。

## 小结

这个页面上描述的行为，没有一条应该被称作 C# 编译器（无论是“正常的”那个还是动态执行所用的内嵌版本）的 bug。它们仅仅是你可能不会去想的一些事情。使用动态类型时你绝对需要小心——它很强大，但并不总是完全按你预期的方式工作。

> 本文是对[Gotchas in dynamic typing](https://csharpindepth.com/articles/DynamicGotchas)这篇文章的翻译，作者是著有[C# in Depth](https://csharpindepth.com/)的大神[Jon Skeet](https://jonskeet.uk/)。非文章原文或本人对某段文字理解，会以斜体 *个人理解：xxx* 进行标注。本人翻译能力有限，强烈建议大家去看原版！
