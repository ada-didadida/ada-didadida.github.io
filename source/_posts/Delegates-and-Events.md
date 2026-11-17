---
title: 委托与事件
date: 2026-11-16 20:10:00
tags:
  - - C#
  - - Delegate
  - - Event
  - - 翻译
categories:
  - - C#
  - - 翻译
top_img: /images/covers/delegates-and-events.png
---

人们常常觉得难以看清事件和委托之间的区别。C# 还在这儿帮了倒忙——它允许你声明*字段式事件*（field-like event），这种事件会自动用一个同名的委托变量作为后备存储。本文的目的就是把这件事给你讲清楚。另一个混淆的来源是“委托”这个词本身的重载：它有时指一个委托*类型*，有时又指委托类型的一个*实例*。我会用“委托类型”和“委托实例”来区分这两种含义，只在笼统谈论整个主题时才说“委托”。<!--more-->

## 委托类型

从某些角度来说，你可以把委托类型想成一个只有单个方法的接口。它规定了一个方法的签名，当你持有委托实例时，就可以像调用一个同签名的方法那样调用它。委托还提供了其他特性，但“能用特定签名发起调用”才是委托这个概念存在的理由。委托持有一个方法的引用，对于实例方法，它还持有该方法应该作用于哪个目标对象的引用。

委托类型用 `delegate` 关键字声明。它既可以独立出现，也可以嵌套在类里，就像下面这样。

```C#
namespace DelegateArticle
{
    public delegate string FirstDelegate (int x);
    
    public class Sample
    {
        public delegate void SecondDelegate (char a, char b);
    }
}
```

这段代码声明了两个委托类型。第一个是 `DelegateArticle.FirstDelegate`，它有一个 `int` 类型的参数，返回 `string`。第二个是 `DelegateArticle.Sample.SecondDelegate`，它有两个 `char` 参数，不返回任何东西（因为返回类型被指定为 `void`）。

要注意 `delegate` 关键字并不总是意味着在声明一个委托类型。用匿名方法创建委托类型的实例时，用的也是同一个关键字。

这里声明的类型都派生自 `System.MulticastDelegate`，而它又派生自 `System.Delegate`。实际上你只会见到派生自 `MulticastDelegate` 的委托类型。`Delegate` 和 `MulticastDelegate` 之间的区别基本上是历史遗留问题：在 .NET 1.0 的 beta 版里，这个区别曾经很显著（也很烦人）——微软考虑过把两个类型合并起来，但觉得在发布周期里已经太晚，做不了这么大的改动。你完全可以当它们只是一个类型。

你创建的任何一个委托类型，都拥有从父类型继承来的成员，外加一个参数为 `object` 和 `IntPtr` 的构造函数，以及三个额外的方法：`Invoke`、`BeginInvoke` 和 `EndInvoke`。构造函数我们过一会儿再说。这三个方法无法从任何地方继承，因为它们的签名要随委托声明时的签名而变化。用上面的示例代码来说，第一个委托拥有下面这些方法：

```C#
public string Invoke (int x);
public System.IAsyncResult BeginInvoke(int x, System.AsyncCallback callback, object state);
public string EndInvoke(IAsyncResult result);
```

可以看到，`Invoke` 和 `EndInvoke` 的返回类型与声明签名一致，`Invoke` 的参数、`BeginInvoke` 的前几个参数也是如此。`Invoke` 的用途我们在下一节就会看到，`BeginInvoke` 和 `EndInvoke` 会在[委托实例：其他方法](#委托实例其他方法)那一节讨论。不过，在还不知道怎么创建实例的情况下就谈调用方法，未免太早了些。下一节会讲这些（以及更多内容）。

## 委托实例：基础

既然已经知道委托类型是怎么声明的、里面包含什么，接下来看看如何创建这样一个类型的实例，以及能拿它做什么。

### 创建委托实例

说明：本文不涉及 C# 2.0 和 3.0 中创建委托实例的那些特性，也不涉及 C# 4.0 引入的泛型委托变体。我[关于闭包的文章](https://csharpindepth.com/articles/Closures)（[译文](/2026/11/16/The-Beauty-of-Closures/)）讨论了 C# 2.0 和 3.0 的相关特性——或者你也可以读《C# in Depth》的第 5、9、13 章，那里有详细得多的内容。我选择专注于 C# 1.0/1.1 中显式创建实例的方式，因为我觉得这样更容易理解底层到底在发生什么。等理解了基础之后，这些后续版本提供的特性显然值得掌握——但如果在基础不牢的情况下就去用它们，很可能会把自己绕晕。

前面说过，任何一个委托实例里最关键的两项数据是：委托引用的方法，以及调用该方法时要作用于其上的引用（即*目标*）。对于静态方法，不需要目标。CLR 本身还支持其他几种略有不同的委托形式：要么把静态方法的第一个参数保存在委托里，要么在调用方法时把实例方法的目标作为参数传进来。如果你感兴趣，可以去看 `System.Delegate` 的文档来了解更多，但不必太在意。

那么，既然已经知道创建一个实例需要哪两项数据（当然还有类型本身），我们该怎么告诉编译器它们是什么呢？我们用的是 C# 规范里称为*委托创建表达式*（delegate-creation-expression）的东西，形式为 `new delegate-type (expression)`。这个表达式要么是同类型的另一个委托（在 C# 2.0 中也可以是兼容的委托类型），要么是一个*方法组*——也就是一个方法的名字，可选地带上一个目标，写法就和你调用这个方法时一样，但不加参数和括号。创建委托的副本相当少见，所以我们主要关注更常见的那种形式。下面列出了几个例子：

```C#
// The following two creation expressions are equivalent,
// where InstanceMethod is an instance method in the class
// containing the creation expression (or a base class). 
// The target is "this".
FirstDelegate d1 = new FirstDelegate(InstanceMethod);
FirstDelegate d2 = new FirstDelegate(this.InstanceMethod);

// Here we create a delegate instance referring to the same method
// as the first two examples, but with a different target.
FirstDelegate d3 = new FirstDelegate(anotherInstance.InstanceMethod);

// This delegate instance uses an instance method in a different class,
// specifying the target to call the method on
FirstDelegate d4 = new FirstDelegate(instanceOfOtherClass.OtherInstanceMethod);

// This delegate instance uses a static method in the class containing
// the creation expression (or a base class).
FirstDelegate d5 = new FirstDelegate(StaticMethod);

// This delegate instance uses a static method in a different class
FirstDelegate d6 = new FirstDelegate(OtherClass.OtherStaticMethod);
```

前面提到的构造函数有两个参数——一个 `object` 和一个 `IntPtr`。`object` 是目标的引用（静态方法为 `null`），`IntPtr` 是指向方法本身的指针。

有一点需要注意：委托实例可以引用那些在真正发起调用时通常不可见的方法和目标。比如，可以用一个私有方法创建委托实例，然后把这个委托实例从某个公开成员返回出去。又比如，实例的目标可能是调用者完全不了解的对象。不过，目标和方法的可访问性都必须对*创建*委托的代码可见。换句话说，当且仅当你能够在某个对象上调用某个方法时，你才能用这个方法加目标来创建委托。访问权限在调用时实际上是被忽略的。说到调用……

### 调用委托实例

调用委托实例就像调用方法本身一样。比如要调用上面变量 `d1` 所引用的那个委托，我们可以写：

```C#
string result = d1(10);
```

委托实例引用的方法会在目标对象上（如果有的话）被调用，并返回结果。要写一个完整的程序来演示这一点，又不掺入大量看似无关的代码，其实是挺麻烦的。不过下面这个程序给了一个静态方法和一个实例方法的例子。`DelegateTest.StaticMethod` 本可以像 `StaticMethod` 那样直接写（就像在实例方法里你可以写 `InstanceMethod` 而不是 `this.InstanceMethod` 一样）——我特意加上了类名，只是为了让“如何引用其他类中的方法”这一点更清楚。

```C#
using System;

public delegate string FirstDelegate (int x);
    
class DelegateTest
{    
    string name;
    
    static void Main()
    {
        FirstDelegate d1 = new FirstDelegate(DelegateTest.StaticMethod);
        
        DelegateTest instance = new DelegateTest();
        instance.name = "My instance";
        FirstDelegate d2 = new FirstDelegate(instance.InstanceMethod);
        
        Console.WriteLine (d1(10)); // Writes out "Static method: 10"
        Console.WriteLine (d2(5));  // Writes out "My instance: 5"
    }
    
    static string StaticMethod (int i)
    {
        return string.Format ("Static method: {0}", i);
    }

    string InstanceMethod (int i)
    {
        return string.Format ("{0}: {1}", name, i);
    }
}
```

C# 的这套语法其实只是对调用各个委托类型提供的 `Invoke` 方法的简写。如果委托类型提供了 `BeginInvoke`/`EndInvoke`，委托还可以异步执行。这些内容会在[后面](#委托实例其他方法)解释。

### 组合委托

委托可以组合起来，这样当你调用这个委托时，一整个方法列表都会被调用——它们可能作用于不同的目标。我之前说委托包含一个目标和一个方法，那是一种简化。那是代表单个方法的委托实例所包含的内容。为了清晰起见，我把这种委托实例叫作*简单委托*。另一种委托实例实际上是一个简单委托的列表，它们的类型都相同（也就是签名相同）。我把这种叫作*组合委托*。组合委托本身还可以再组合，按显而易见的规则最终形成一个大的简单委托列表。

要理解的重要一点是：委托实例永远是不可变的。任何把它们组合在一起（或从另一个中减去一个）的操作，都会创建一个新的委托实例来表示新的目标/方法列表。这和字符串很像：比如你调用 `String.PadLeft`，它并不会真的改变你调用它的那个字符串，只是返回一个补好空格的新字符串。

组合两个委托实例通常用加法运算符，就好像委托实例是字符串或数字一样。从一个中减去另一个通常用减法运算符。注意，当你从一个组合委托中减去另一个组合委托时，减法是以*列表*为单位进行的。如果要减去的列表在原有列表中找不到，结果就是原列表。否则，会移除该列表*最后一次*出现的位置。用例子来说明最清楚了。下面不用真实代码，而是用简单委托的列表 `d1`、`d2` 等来表示。例如 `[d1, d2, d3]` 是一个组合委托，执行时会依次调用 `d1`、`d2`、`d3`。空列表用 `null` 表示，而不是一个实际的委托实例。

| 表达式 | 结果 |
| --- | --- |
| null + d1 | d1  |
| d1 + null | d1  |
| d1 + d2 | [d1, d2] |
| d1 + [d2, d3] | [d1, d2, d3] |
| [d1, d2] + [d2, d3] | [d1, d2, d2, d3] |
| [d1, d2] - d1 | d2  |
| [d1, d2] - d2 | d1  |
| [d1, d2, d1] - d1 | [d1, d2] |
| [d1, d2, d3] - [d1, d2] | d3  |
| [d1, d2, d3] - [d2, d1] | [d1, d2, d3] |
| [d1, d2, d3, d1, d2] - [d1, d2] | [d1, d2, d3] |
| [d1, d2] - [d1, d2] | null |

委托实例也可以用静态方法 `Delegate.Combine` 来组合，用静态方法 `Delegate.Remove` 来相减。C# 编译器会把加减运算符转换成对这些方法的调用。因为它们是静态方法，所以能很方便地处理 `null` 引用。

加减运算符总是作为赋值的一部分来工作：`d1 += d2;` 完全等价于 `d1 = d1+d2;`，减法同理。同样，原来的委托实例保持不变，只是 `d1` 的值变成了指向相应新组合委托的引用。

注意，由于多余的委托既会被追加到列表末尾，也会从列表末尾移除，`x += y; x -= y;` 永远是一个空操作。

如果委托类型声明了返回值（也就是说不是 `void` 返回类型），并且调用的是一个组合委托实例，那么这次调用返回的值就是列表中最后一个简单委托返回的值。

## 事件

首先要说的第一件事：事件不是委托实例。再说一遍。

**事件不是委托实例。**

从某些方面来说，C# 允许你在特定场合以同样的方式使用它们，这挺不幸的，但理解两者的区别非常重要。

我觉得理解事件最简单的方式，是把它们想得有点像属性。属性*看起来*像字段，但它们绝对不是字段——你完全可以写出完全不使用字段的属性。类似地，虽然事件在表达添加和移除操作的方式上看起来像委托实例，但它们并不是。

事件是一对方法，在 IL 中被适当地装饰以绑定在一起，让语言知道这两个方法代表一个事件。这两个方法对应*添加*（add）和*移除*（remove）操作，各自接受一个同类型（即事件的类型）的委托实例参数。你拿这两个操作做什么基本随你，但*典型*用法是从事件的处理程序列表中添加或移除委托。事件被触发时（无论触发源是什么——按钮点击、超时、未处理的异常），处理程序会被依次调用。注意在 C# 中，调用事件处理程序并*不*是事件本身的一部分。（CIL 定义了一个与 `raise_事件名` 方法的关联，也确有其他一些“其他”方法，但 C# 并不使用它们。）

在 C# 中，添加和移除方法分别用 `eventName += delegateInstance;` 和 `eventName -= delegateInstance;` 来调用，其中 `eventName` 可以带引用限定（如 `myForm.Click`）或类型名限定（如 `MyClass.SomeEvent`）。静态事件相对少见。

事件本身有两种声明方式。第一种是显式写出添加和移除方法，声明方式和属性非常相似，只是用 `event` 关键字。下面是一个针对 `System.EventHandler` 委托类型的事件的例子。注意它实际上并不对传给添加和移除方法的委托实例做任何事——只是打印出调用的是哪个操作。还要注意，尽管我们让它移除 `null`，移除操作照样被调用了。

```C#
using System;

class Test
{
    public event EventHandler MyEvent
    {
        add
        {
            Console.WriteLine ("add operation");
        }
        
        remove
        {
            Console.WriteLine ("remove operation");
        }
    }       
    
    static void Main()
    {
        Test t = new Test();
        
        t.MyEvent += new EventHandler (t.DoNothing);
        t.MyEvent -= null;
    }
    
    void DoNothing (object sender, EventArgs e)
    {
    }
}
```

虽然这样忽略值的情况非常少见，但有些时候你并不想用一个简单的委托变量给事件做后备存储。比如，在事件很多、但只有少数几个会被订阅的情况下，你可以用一张从描述事件的某个键到当前处理它的委托的映射表。Windows Forms 就是这么做的——这意味着你可以拥有大量事件，而不必浪费大量内存去存放那些通常只是 `null` 的变量。

## 一个捷径：字段式事件

C# 提供了一种简单的方式，可以同时声明一个委托变量和一个事件。这叫作*字段式事件*（field-like event），声明起来非常简单——它和“长写法”的事件声明一样，只是去掉了“主体”部分：

```C#
public event EventHandler MyEvent;
```

这会创建一个委托变量和一个事件，两者类型相同。事件的访问级别由事件声明决定（所以上面的例子创建的是一个公开事件），但委托变量永远是私有的。事件隐式的主体就是在委托变量上添加/移除委托实例，只不过这些改动是在锁的保护下进行的。在 C# 1.1 中，这个事件等价于：

```C#
private EventHandler _myEvent;
    
public event EventHandler MyEvent
{
    add
    {
        lock (this)
        {
            _myEvent += value;
        }
    }
    remove
    {
        lock (this)
        {
            _myEvent -= value;
        }
    }        
}
```

这只是针对实例成员而言。对于声明为静态的事件，变量也是静态的，锁加在 `typeof(XXX)` 上，其中 `XXX` 是声明该事件的类名。在 C# 2.0 中，对锁用哪个对象几乎没有保证——只保证实例事件用某个与实例关联的单一对象加锁，静态事件用某个与类关联的单一对象加锁。（注意这只适用于*类*事件，不适用于*结构体*事件——结构体事件在加锁方面有些问题；实际上我不记得自己见过任何带事件的结构体。）这些其实都不像你想的那么有用——详见[线程安全那一节](#线程安全的事件)。

那么，当你在代码中引用 `MyEvent` 时会发生什么？在类型自身内部（包括嵌套类型），编译器生成的代码引用的是委托变量（我上面的示例里是 `_myEvent`）。在其他所有上下文中，编译器生成的代码引用的都是事件。

## 这样做的意义何在？

既然知道了它们是什么，那同时保留委托和事件有什么意义？答案是封装。假设 C#/.NET 中不存在事件这个概念，另一个类要怎样才能订阅事件呢？三种选择：

1. 一个公开的委托变量
2. 一个由属性包装的委托变量
3. 一个委托变量，外加 `AddXXXHandler` 和 `RemoveXXXHandler` 方法

方案 1 显然很糟，理由就是我们厌恶公开变量的一切常规理由。方案 2 稍好一点，但它实际上允许订阅者互相覆盖——太容易写出 `someInstance.MyEvent = eventHandler;`，这会把现有的事件处理程序*替换*掉，而不是新增一个。此外，你还是得自己写这些属性。

方案 3 基本上就是事件给你的东西，但带有一个有保证的约定（由编译器生成，并由 IL 中的额外标志支持），而且如果你对字段式事件的语义感到满意，还能得到一个“免费”的实现。订阅和取消订阅事件被封装了起来，同时不允许随意访问处理程序列表，语言也可以通过提供声明和订阅的语法让事情更简单。

## 线程安全的事件

（注意：考虑到 C# 4 的情况，这一节需要做相当程度的修订。）

前面我们提到过，字段式事件在添加/移除操作期间会加锁。这是为了提供一定程度的线程安全。可惜的是，它并不怎么有用。首先，即便到了 2.0，规范也允许把锁加在指向 `this` 对象的引用上，或者对静态事件加在类型本身上。这与“锁在私有持有的引用上以避免意外死锁”的原则相违背。

讽刺的是，第二个问题恰好是第一个问题的反面——因为在 C# 2.0 中你无法保证用的是哪把锁，所以你自己在触发事件时也没法用它来确保在触发线程中看到的是最新的值。你可以锁在别的东西上，或者调用某个内存屏障方法，但总觉得有点别扭。

如果你想要真正的线程安全，即触发事件时总是使用委托变量的最新值，同时确保添加/移除操作互不干扰，那就得自己写添加/移除操作的主体。下面是个例子：

```C#
/// <summary>
/// Delegate variable backing the SomeEvent event.
/// </summary>
SomeEventHandler someEvent;

/// <summary>
/// Lock for SomeEvent delegate access.
/// </summary>
readonly object someEventLock = new object();

/// <summary>
/// Description for the event
/// </summary>
public event SomeEventHandler SomeEvent
{
    add
    {
        lock (someEventLock)
        {
            someEvent += value;
        }
    }
    remove
    {
        lock (someEventLock)
        {
            someEvent -= value;
        }
    }
}

/// <summary>
/// Raises the SomeEvent event
/// </summary>
protected virtual void OnSomeEvent(EventArgs e)
{
    SomeEventHandler handler;
    lock (someEventLock)
    {
        handler = someEvent;
    }
    if (handler != null)
    {
        handler (this, e);
    }
}
```

你可以让所有事件共用一把锁，甚至把它也用于其他用途——这取决于你的场景。注意你需要在这个锁内把当前值赋给一个局部变量（以取得最新值），然后在锁*外*检查它是否为 null 并执行它：持有锁的同时触发事件是非常糟糕的主意，很容易死锁。（事件处理程序很可能需要等待另一个线程做点什么，而如果那个线程又去调用你事件的添加或移除操作，就会死锁。）

这一切之所以成立，是因为一旦 `handler` 被赋为 `someEvent` 的值，即使 `someEvent` 之后变了，`handler` 的值也不会变。所以如果所有处理程序都从事件上取消了订阅，`someEvent` 会变成 `null`，但 `handler` 仍是它被赋值时的那个值。事实上，由于委托实例是不可变的，在执行 `handler = someEvent;` 那一行时订阅了哪些处理程序，就会调用哪些，即使在这之后、到 `handler (this, e);` 那一行之前又有人订阅了也一样。

现在，非常重要的一点是要考虑你到底*需不需要*线程安全。事件处理程序会从其他线程添加或移除吗？你需要从其他线程触发事件吗？如果你完全掌控着自己的应用，答案很可能就是“不需要”。（如果你在编写类库，那线程安全很可能就很重要。）如果你不需要线程安全，你可能会想自己实现添加/移除操作，以绕开 C# 所用（在 2.0 的情况下是“可能所用”）的外部可见的锁。这时候这些操作就变得相当琐碎了。下面是前面那段代码的等价版本，只是没有线程安全。

```C#
/// <summary>
/// Delegate variable backing the SomeEvent event.
/// </summary>
SomeEventHandler someEvent;

/// <summary>
/// Description for the event
/// </summary>
public event SomeEventHandler SomeEvent
{
    add
    {
        someEvent += value;
    }
    remove
    {
        someEvent -= value;
    }
}

/// <summary>
/// Raises the SomeEvent event
/// </summary>
protected virtual void OnSomeEvent(EventArgs e)
{
    if (someEvent != null)
    {
        someEvent (this, e);
    }
}
```

检查是否为 null 是因为没有委托实例可调用时，委托变量就是 `null`。让事情更简单的一种做法，是把一个空操作的委托实例当作“默认”值，永不移除。这样你就可以直接取委托变量的值（如果要线程安全，就在锁内取），然后执行这个委托实例。如果没有“真正的”委托目标可调用，那个空操作的目标就会执行，仅此而已。

## 委托实例：其他方法

前面我们看到，对 `someDelegate(10)` 的调用实际上是对 `someDelegate.Invoke(10)` 的简写。委托类型也可能通过 `BeginInvoke`/`EndInvoke` 这一对方法支持异步行为。就 CLI 规范而言它们是可选的，但 C# 的委托类型总是提供它们。它们遵循与 .NET 其余部分相同的异步执行模型，允许提供一个回调处理程序，以及一个用于保存状态信息的对象。委托在系统线程池创建的线程上执行。

下面的第一个例子不使用回调，只是在同一个线程里简单地使用 `BeginInvoke` 和 `EndInvoke`。当一个单线程负责的操作总体上同步、但其中某些部分可以并行执行时，这种用法偶尔有用。为简单起见，涉及的方法都是静态的，但也可以使用（而且经常使用）带特定目标对象的委托实例。`EndInvoke` 会返回委托调用返回的任何值。如果调用抛出了异常，`EndInvoke` 会抛出同样的异常。

```C#
using System;
using System.Threading;

delegate int SampleDelegate(string data);
    
class AsyncDelegateExample1
{
    static void Main()
    {
        SampleDelegate counter = new SampleDelegate(CountCharacters);
        SampleDelegate parser = new SampleDelegate(Parse);
        
        IAsyncResult counterResult = counter.BeginInvoke ("hello", null, null);
        IAsyncResult parserResult = parser.BeginInvoke ("10", null, null);
        Console.WriteLine ("Main thread continuing");
        
        Console.WriteLine ("Counter returned {0}", counter.EndInvoke(counterResult));
        Console.WriteLine ("Parser returned {0}", parser.EndInvoke(parserResult));
        
        Console.WriteLine ("Done");
    }
    
    static int CountCharacters (string text)
    {
        Thread.Sleep (2000);
        Console.WriteLine ("Counting characters in {0}", text);
        return text.Length;
    }
    
    static int Parse (string text)
    {
        Thread.Sleep (100);
        Console.WriteLine ("Parsing text {0}", text);
        return int.Parse(text);
    }
}
```

对 `Thread.Sleep` 的调用只是为了证明执行确实是并行发生的。`CountCharacters` 里的 sleep 之所以那么长，是为了迫使系统线程池用两个不同的线程来跑这两个任务——线程池会把耗时短的请求串行化，以避免创建超出需要的线程。通过睡很长时间，我们模拟了一个长时间运行的请求。下面是一次示例运行的输出：

```
Main thread continuing
Parsing text 10
Counting characters in hello
Counter returned 5
Parser returned 10
Done
```

对 `EndInvoke` 的调用会阻塞，直到委托完成，这很像 `Thread.Join` 会阻塞到相关线程终止。`BeginInvoke` 调用返回的 `IAsyncResult` 允许你访问作为 `BeginInvoke` 最后一个参数传入的状态，但在上面这种异步调用方式里通常用不到。

上面的代码相当简单，但往往不如“委托完成后回调”的模型强大。典型情况下，回调会调用 `EndInvoke` 来取得委托的结果。虽然它理论上仍是阻塞调用，但实际上永远不会阻塞，因为回调只在委托已经完成时才执行。回调很可能会把传给 `BeginInvoke` 的状态当作额外的上下文信息。下面的示例代码使用与上一个例子相同的计数和解析委托，但带一个显示结果的回调。状态被用来决定如何格式化每个结果，因此一个回调可以同时用于两个异步调用。注意从 `IAsyncResult` 到 `AsyncResult` 的强制转换：传给回调的值总是 `AsyncResult` 的实例，可以用它取得原来的委托实例，从而让回调调用 `EndInvoke`。`AsyncResult` 住在 `System.Runtime.Remoting.Messaging` 命名空间里，而其他相关类都在 `System` 或 `System.Threading` 中，这多少有点反常，但生活就是这样。

```C#
using System;
using System.Threading;
using System.Runtime.Remoting.Messaging;

delegate int SampleDelegate(string data);
    
class AsyncDelegateExample2
{
    static void Main()
    {
        SampleDelegate counter = new SampleDelegate(CountCharacters);
        SampleDelegate parser = new SampleDelegate(Parse);
        
        AsyncCallback callback = new AsyncCallback (DisplayResult);
        
        counter.BeginInvoke ("hello", callback, "Counter returned {0}");
        parser.BeginInvoke ("10", callback, "Parser returned {0}");

        Console.WriteLine ("Main thread continuing");

        Thread.Sleep (3000);
        Console.WriteLine ("Done");
    }
    
    static void DisplayResult(IAsyncResult result)
    {
        string format = (string) result.AsyncState;
        AsyncResult delegateResult = (AsyncResult) result;
        SampleDelegate delegateInstance = (SampleDelegate)delegateResult.AsyncDelegate;
        
        Console.WriteLine (format, delegateInstance.EndInvoke(result));
    }
    
    static int CountCharacters (string text)
    {
        Thread.Sleep (2000);
        Console.WriteLine ("Counting characters in {0}", text);
        return text.Length;
    }
    
    static int Parse (string text)
    {
        Thread.Sleep (100);
        Console.WriteLine ("Parsing text {0}", text);
        return int.Parse(text);
    }
}
```

这一次几乎所有工作都在线程池线程上完成。主线程只是启动异步任务，然后睡足够长的时间让所有工作结束。（线程池线程是后台线程——如果没有额外的 `Sleep` 调用，应用会在委托调用执行完之前就终止了。）下面是一些示例输出——注意这一次因为对 `EndInvoke` 的调用没有保证的顺序，解析器的结果先于计数器的结果显示出来。在上一个例子里，解析器几乎肯定先于计数器完成，但主线程先等了计数器的结果。

```
Main thread continuing
Parsing text 10
Parser returned 10
Counting characters in hello
Counter returned 5
Done
```

注意，使用异步执行时你*必须*调用 `EndInvoke`，以保证不泄漏内存或句柄。某些实现可能不会泄漏，但不应该依赖这一点。如果这一点让你不便，可以看我[关于线程池的文章](https://jonskeet.uk/csharp/threads/threadpool.shtml)，里面有一些实现“发了就不管”式异步行为的示例代码。

## 小结

委托提供了一种简单的方式，可以把一次方法调用（可能还带一个目标对象）表示成可以四处传递的数据。它们是事件的基础，而事件实际上是一套约定，用于在合适的时机添加和移除要调用的处理程序代码。

> 本文是对[Delegates and Events](https://csharpindepth.com/articles/Events)这篇文章的翻译，作者是著有[C# in Depth](https://csharpindepth.com/)的大神[Jon Skeet](https://jonskeet.uk/)。非文章原文或本人对某段文字理解，会以斜体 *个人理解：xxx* 进行标注。本人翻译能力有限，强烈建议大家去看原版！
