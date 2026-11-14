---
title: Unicode和.NET
tags:
  - - C#
  - - Unicode
  - - 翻译
categories:
  - - C#
  - - 翻译
date: 2021-01-21 16:38:43
top_img: /images/covers/unicode.png
---


## Unicode探测器

这部分以前是在文章末尾，但这其实是最有用的，所以我认为它应当放在文章一开始的地方，广而告之。下面的工具是一段小小的Javascript代码，它可以显示你输入到文本框中的任何字符串的有用信息。它不仅可以帮你找出代码中字符的UTF-8表示形式，而且我发现它还可以用于排查因为无法打印的文本而造成的问题。

<p>
  在这里输入文本:
  <input type="text" id="explorer-input" onkeyup="displayData();" />
</p>
<table class="grid">
    <thead>
        <tr>
            <th>Character</th>
            <th>Unicode</th>
            <th>UTF-16</th>
            <th>UTF-8</th>
        </tr>
    </thead>
    <tbody id="explorer-output-tbody">
</table>

<script>
function createCell(text) 
{
    var element = document.createElement("td");
    element.appendChild(document.createTextNode(text));
    return element;
}
function toHex(value, minLength) 
{
    var hex = value.toString(16).toUpperCase();
    if (hex.length >= minLength) {
        return hex;
    } else {
        hex = "000000" + hex;
        return hex.substring(hex.length - minLength);
    }
}
function joinHex(array, hexLength) 
{
    var result = "";
    for (var i = 0; i < array.length; i++) {
        if (i != 0) {
            result += " ";
        }
        result += toHex(array[i], hexLength);
    }
    return result;
}
function isHighSurrogate(codeUnit) 
{
    return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}
function isLowSurrogate(codeUnit) 
{
    return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}
function combineSurrogates(high, low) 
{
    return 0x10000 + (high - 0xd800) * 0x400 + (low - 0xdc00);
}
function extractAndShift(value, firstBit, count) 
{
    // This has the correct bottom-most bits, but also information to remove.
    var shifted = value >> (firstBit - count);
    // This is the same as (shifted), but with the bottom-most bits all cleared.
    // In other words, this is the part to remove.
    var extra = (value >> firstBit) << count;
    return shifted - extra;
}
function toUtf8(codePoint) 
{
    if (codePoint < 0x80) {
        return [codePoint];
    } else if (codePoint < 0x800) {
        return [0xc0 | extractAndShift(codePoint, 11, 5),
        0x80 | extractAndShift(codePoint, 6, 6)];
    } else if (codePoint < 0x10000) {
        return [0xe0 | extractAndShift(codePoint, 16, 4),
        0x80 | extractAndShift(codePoint, 12, 6),
        0x80 | extractAndShift(codePoint, 6, 6)];
    } else {
        return [0xf0 | extractAndShift(codePoint, 21, 3),
        0x80 | extractAndShift(codePoint, 18, 6),
        0x80 | extractAndShift(codePoint, 12, 6),
        0x80 | extractAndShift(codePoint, 6, 6)]
    }
}

function displayData() 
{
        var text = document.getElementById("explorer-input").value;
        var table = document.getElementById("explorer-output-tbody");
        table.innerHTML = "";
        for (i = 0; i < text.length;) 
        {
            // First work out all the tricky Unicode parts...
            var codePoint = text.charCodeAt(i);
            var length = 1;
            var surrogate = false;
            if (isHighSurrogate(codePoint) && i < text.length - 1
                && isLowSurrogate(text.charCodeAt(i + 1))) {
                var high = codePoint;
                var low = text.charCodeAt(i + 1);
                codePoint = combineSurrogates(high, low);
                length = 2;
                surrogate = true;
            }
            var utf8 = toUtf8(codePoint);
            var utf16 = surrogate ? [high, low] : [codePoint];

            // The rest is just display
            var row = document.createElement("tr");
            row.appendChild(createCell(text.substring(i, i + length)));
            row.appendChild(createCell("U+" + toHex(codePoint, 4)));
            row.appendChild(createCell(joinHex(utf16, 4)))
            row.appendChild(createCell(joinHex(utf8, 2)))
            table.appendChild(row);
            i += length;
        }
}
</script>

<!--more-->
该表格将文本框中的文本分解为Unicode字符。它不执行任何形式的规范化，因此一个重音字符可能会以一个字符或多个字符的形式出现，这取决于它是以包括重音在内的单个字符（如é）的形式输入，还是以一个非重音字符后的组合字符的形式输入（如é——是的，这确实与前面的例子不同；复制并粘贴这两个字符到上文工具中看看！）然而，它确实将输入分解为Unicode字符，而不仅仅是UTF-16代码单位；一个代理对被视为了一个单一字符。例如，𠬠（这显然不是一个有效的Unicode字符，但它似乎又有一个能被普遍理解的含义和字形）显示为U+20B20。

第一列只是显示字符。第二列显示Unicode码（U+0000到U+10FFFF），在[Unicode码图](http://unicode.org/charts/)中可以方便地查找。第三列显示组成字符的UTF-16单位：这些是在C#（或Java，或Javascript）脚本中出现的字符（`char`）值。对于基本多语言平面（Basic Multilingual Plane）的字符，这将只是一个单一的代码单元；对于其他字符，它就是代理对（先高后低）。第四列显示以字节为单位的UTF-8表示的字符。

## 本文适用范围

这是一个很大的话题。不要指望这篇文章能做太多的事——事实上，如果你认为你已经对字符编码和类似的东西有相当的经验和知识，这篇文章很可能不会带给你任何新的或有用的东西。但是，还是有很多人不明白二进制和文本的区别，也不知道什么是字符编码等等。这篇文章就是为这些人写的。文中会提到一些高级主题，但只是为了让读者意识到其存在，而不会对其进行过多指导。

## 资源

下面的链接至少可能和本文一样有用，甚至可能更有用些——其中也有更多值得阅读的内容。在写本文时，我对其中所有的内容（甚至更多）都进行参考了。其中很多不错的信息，虽然这个页面上可能有一些不准确的地方（如果你发现了，请发邮件给我：[skeet@pobox.com](mailto:skeet@pobox.com)），但这些资源应该是正确的。
- [Unicode网站主页](https://home.unicode.org/)
&emsp;&emsp;关于Unicode的权威资源，虽然听着有点吓人，但上面有你需要的关于Unicode的所有答案——下面这些有所帮助的链接就是来自该网站。
- [Unicode术语表](http://www.unicode.org/glossary/)
&emsp;&emsp;在讨论字符编码（等）问题时，许多术语的定义一目了然。
- [Unicode常见问题](http://www.unicode.org/faq/)
&emsp;&emsp;对上百个常见问题分门别类，进行解答。
- [Unix/Linux UTF-8/Unicode常见问题](https://www.cl.cam.ac.uk/~mgk25/unicode.html)
&emsp;&emsp;如果你不喜欢Unix/Linux，不要被标题吓倒——里面的大部分信息都与.NET问题相关。
- [Unicode字符编码模型](http://www.unicode.org/reports/tr17/)
&emsp;&emsp;提供更多关于"字符编码方案"等准确含义的信息。
- [每位软件开发人员一定要了解的Unicode和字符集的最低要求（没有借口！）](https://www.joelonsoftware.com/2003/10/08/the-absolute-minimum-every-software-developer-absolutely-positively-must-know-about-unicode-and-character-sets-no-excuses/)
&emsp;&emsp;和本文有些类似，但没有重点针对 .NET。
- [Unicode的优势](http://www.tbray.org/ongoing/When/200x/2003/04/06/Unicode)
&emsp;&emsp;又是一篇值得一读的介绍性文章。

## 二进制和文本——巨大的区别

大多数现代计算机语言（和一些较老的语言）在 "二进制 "内容和 "字符"（或 "文本"）内容之间有很大的区别。两者的差异和本能感觉的差异区别不大，但为了清楚起见，我会将其定义如下：
- 二进制内容是一个八位字节（通俗地说就是字节）的序列，没有附加任何内在意义。即使可能存在有外部的手段来解读一段二进制内容，比如一张图片或是一个可执行文件，但其内容本身就是一个字节序列。（那些老学究读者注意啦：从现在开始，不会再用“八位数”（octet）这个词了，我会用“字节”（byte）来代替，尽管严格来说，一个字节不一定是八位字节，比如说，已经有了9位字节的架构。我认为在当今时代，去做这个区分没有什么用处，读者可能更喜欢用“字节”这个词。）
- 字符内容是一个字符序列。

[Unicode术语表](http://www.unicode.org/glossary/#character)对字符的定义是：
1. 书面语言中具有语义价值的最小成分；表示的是抽象的意义和/或形状，而不是具体的形状（另见字形），尽管在代码表中，某种形式的视觉表示对读者的理解至关重要。
2. 抽象字符的同义词。（参见第3.3节字符和编码表示中的定义D3。）
3. Unicode字符编码的基本编码单位。
4. 源于中国的表意文字元素的英文名称。（见表意文字（2）。）

这对你来说可能是一个很有用的定义，也可能不是，但大多数情况下，你只需要本能的理解为——一个字符就是类似于“大写字母A”、“数字1”的东西。还有一些不太明显的字符，如：组合字符，如 "急促的口音（an acute accent）"，控制字符，如 "换行"，以及格式化字符（是不可见的，但会影响周围的字符）。重要的是，这些基本上都是某种形式的 "文本"。它们都具有某种意义。

现在，不幸的是，在这之前两者的区别已经很模糊了——C程序员往往习惯于把“字节（byte）”和“char”看作是可以互换的，以至于他们会说要读取一定数量的字符，尽管其中的内容完全是二进制的。在 .NET和Java等现代环境中，两者的区别是很明显的，并且是存在于IO库中的，这可能导致人们试图通过读写字符来复制二进制文件时，导致输出的损坏。

## Unicode从何而来？

Unicode协会是一个尝试标准化处理字符数据的机构，包括将其转换为二进制格式（也就是编码和解码）。还有一套ISO标准（各种版本中的10646）也在做类似的事情；Unicode和ISO 10646在很大程度上可以被认为是在做 "同样的事情"，因为它们几乎在所有方面都是兼容的。（理论上，ISO 10646定义了更大的潜在字符集，但这可能不会成为一个问题）。大多数现代计算机语言和环境，如.NET和Java，都使用Unicode来表示字符。Unicode定义了抽象字符集（其所涵盖的字符集）、编码字符集（从字符集中的每个字符到非负整数的映射）、一些字符编码形式（从编码字符集中的非负整数到“代码单位”（如字节）序列的映射）和一些字符编码方案（从代码单位序列到序列化字节序列的映射）。字符编码形式和字符编码方案之间的区别略有些微妙，但考虑到了像字节序（大端，小端）这样的东西。（例如，UCS-2编码单元序列0xc2 0xa9可以序列化为0xc2 0xa9或0xa9 0xc2，这是由字符编码方案决定的。）

理论上，Unicode抽象字符库最多可以容纳1114112个字符，不过很多字符是保留为无效的，其余的也不可能全部被分配。每个字符都是0到1114111（0x10ffff）之间的整数。例如，大写字母A的编码为65。直到几年前，人们还期望只需要用0到2^16^-1范围内的字符，这意味着每个字符只需要2个字节来表示。不幸的是，越来越多的字符被引入，代理对的概念也被提了出来。这些事情会引生一些重大的混乱（至少，这会会使我产生重大的混乱），本文其余部分的大部分内容将忽略它们的存在——我将在 "讨厌的部分 "这一章节中简要介绍它们。

## .NET提供了什么？

如果上面提到的内容听起来比较混乱，不用担心。只需要注意其中的区别，实际上这些情况不会经常出现。大多数时候，你只是想把一些字节转换成字符，或者把字符转成字节。这就是`System.Text.Encoding `类，以及`System.Char`结构（C#中又称`char`）和`System.String`（C#中又称`string`）的作用。

`char`是最基本的字符类型。每个`char`都是一个单一的Unicode字符，它在内存中占用2个字节，取值范围是0-65535。请注意，并非所有的值都是有效的Unicode字符。

基本上，字符串（`string`）就是一个字符序列。它是不可变的，这意味着一旦你创建了一个字符串实例（无论你是怎么创建的），你就无法改变它了——字符串类中的各种方法让你以为可以改变字符串，实际上都只是返回了一个基于原始字符串做过相应改变的新字符串。

`System.Text.Encoding`类提供了将字节数组转换为字符数组或字符串的方法，当然也有反向方法（将字符数组或字符串转换为字节数组）。该类本身是抽象类；各种实现由 .NET提供，而且也很容易实例化，如果用户愿意，也可以编写自己的派生类（这种需求十分罕见——大多是情况下，使用内置的实现就可以了）。可以为一种编码提供单独的编码器和解码器，两者在调用之间维持其状态。这对于多字节字符编码方案是有必要的，因为在某些情况下，只有在接收到流中所有的字节后才能进行解码。例如，如果UTF-8解码器收到`0x41 0xc2`，可以返回第一个字符（大写字母A），但必须接收到第三个字节，才能确定第二个字符是什么。

## 内置编码方案

.NET提供了各种 "开箱即用 "的编码方案。下面是对各种不同编码方案的描述（就我能找到的而言），以及如何检索它们。

### ASCII

ASCII是最常见也最容易被误解的字符编码之一。与人们普遍认为的不同，它只有7位——意思是ASCII码的值不会高于127（2^7^-1）。如果有人说想要的编码是（例如）“ASCII 154”，那么他可能根本不知道他说的编码到底是啥。如果非要解释一下，他可能会说这是“扩展ASCII”。但其实没有一种编码方案叫做“扩展ASCII”。倒是有很多8位编码算是ASCII的超集，通常他们所说的是其中的一种——他们电脑上默认的Windows代码页（Windows Code Page）。每个ASCII字符在ASCII编码中的值与Unicode编码字符集中的值相同，换句话说，ASCII内的所有字符ASCII x的值与Unicode x的值相同。在我看来，.NET `ASCIIEncoding`类（使用`Encoding.ASCII`属性可以很容易地检索到它的一个实例）稍微有点奇怪，因为它似乎只是通过剥离掉底部7以上的所有位来进行编码。这意味着，例如，Unicode字符0xb5（"微号"（μ））在编码再解码后将成为Unicode 0x35（"数字五"），而不是像其他一些字符一样，显示它是一个不包含在ASCII中的字符。

### UTF-8

UTF-8是表示Unicode字符的一种通用方式。每个字符被编码为1-4个字节的序列。(所有值小于65536的字符都是以1-3字节编码的；我没有核实过 .NET是将代理字符编码为两个1-3字节的序列，还是一个4字节的序列)。它可以表示所有的字符，它是 "兼容ASCII "的，因为ASCII中的任意字符序列在UTF-8中都会被编码成与ASCII中完全相同的字节序列。此外，第一个字节可以表明整个字符需要多少额外的字节（如果有的话）才能被解码。UTF-8本身不需要字节排序标记（byte-ordering mark）(BOM)，尽管它可以用来证明文件确实是UTF-8格式的。UTF-8编码的BOM总是0xef 0xbb 0xbf。在.NET中获取UTF-8编码很简单——使用`Encoding.UTF8`属性。事实上，很多时候你甚至不用这样做——许多类（如`StreamWriter`）在没有指定编码时默认使用UTF-8。(不要被`Encoding.Default`误导——那完全是另一回事！)不过，为了可读性，我还是建议要指定编码。

### UTF-16和UCS-2

UTF-16实际上是.NET内部维护字符的方式。每个字符都被编码为2个字节的序列，但代理字符除外，代理字符需要4个字节。UTF-16和UCS-2（也被称为 "Unicode"）之间唯一的区别就是使用代理对的条件，后者只能表示值为0-0xffff的字符。UTF-16可以表示成大端、小端，也可以是机器依赖性的可选BOM（0xff 0xfe代表小端，0xfe 0xff代表大端）。在.NET中，我认为代理对的问题已经被遗忘了，代理对中的每一个值都被视为一个单独的字符，使得UCS-2和UTF-16以一种模糊的方式 "相同"了。（如果要了解UCS-2和UTF-16的具体差异，恐怕需要对代理字符有更深入的理解——如果你想要知道两者差异的细节，那你有可能会比我知道的还多。）大端编码可以使用`Encoding.BigEndianUnicode`检索，小端编码可以使用`Encoding.Unicode`检索。两者都是`System.Text.UnicodeEncoding`的实例，你也可以在编码时使用适当的参数（是否使用BOM，使用大段还是小端）构造出实例。我认为（虽然我没测试过）当解码二进制内容时，内容中的BOM会覆盖编码器中大小端的设置，所以如果程序员知道是大端还是小端或者知道内容是否包含BOM，就不需要做额外的工作。

### UTF-7

以我的经验来说，UTF-7很少使用，但是它可以将Unicode（可能只有前65535个字符）完全编码成ASCII字符（不是字节！）。这对于那些只支持ASCII字符或某些ASCII字符子集（如，EBCDIC编码）的邮件网关是很有用的。这个描述听着有点冗长，这是因为：我还没详细研究过它，也不打算研究。如果你需要用它，你可能需要好好地理解一下，反正要是你用不到，就别管它了。在.NET中，可以使用`Encoding.UTF7`检索编码实例。

### Windows/ANSI代码页

Windows代码页一般是单字节或双字节字符集，分别编码到256或65536字符。每一个都是有编号的，可以使用`Encoding.GetEncoding(int)`来检索已知代码页编号的编码。编码页对那些存储在“默认编码页”中的遗留数据有很大用处。可以使用`Encoding.Default`来检索默认代码页的编码。同样，我也尽量避免使用代码页。更多信息可以在MSDN中查找。

### ISO-8859-1(Latin-1)

与ASCII码一样，Latin-1中的每个字符都与Unicode中的相同。我还不能确定Latin-1是否在128到159之间存在一个未定义字符的“洞”，或者它是否包含了与Unicode相同的控制字符。（我以前倾向于存在“洞”的这个想法，但[维基百科](https://en.wikipedia.org/wiki/ISO/IEC_8859-1)不同意，所以我对此无法下定论）。Latin-1与代码页28591相同，所以获取它的编码很简单：`Encoding.GetEncoding (28591)`。

## 流，读取和写入

流本质上就是二进制的——从根本上讲，它们是以字节为单位进行读写的。任何带有字符串的事物都会以某种形式进行二进制转换，这有可能正是你想要的也有可能不是。用于读写文本流的分别的是`System.IO.TextReader`和`System.IO.TextWriter`。如果你已经有了一个流，可以分别使用`System.IO.StreamReader`(派生自`TextReader`)和`System.IO.StreamWriter`(派生自`TextWriter`)，你可以用你想用的编码和流对其进行构建。如果你没有指定编码，默认使用UTF-8。下面是将一个文件从UTF-8转为UCS-2的示例代码：
```C#
using System;
using System.IO;
using System.Text;

public class FileConverter
{
    const int BufferSize = 8096;
    
    public static void Main(string[] args)
    {
        if (args.Length != 2)
        {
            Console.WriteLine 
                ("Usage: FileConverter <input file> <output file>");
            return;
        }
        
        // Open a TextReader for the appropriate file
        using (TextReader input = new StreamReader 
               (new FileStream (args[0], FileMode.Open),
                Encoding.UTF8))
        {
            // Open a TextWriter for the appropriate file
            using (TextWriter output = new StreamWriter 
                   (new FileStream (args[1], FileMode.Create),
                    Encoding.Unicode))
            {
                // Create the buffer
                char[] buffer = new char[BufferSize];
                int len;
                
                // Repeatedly copy data until we've finished
                while ( (len = input.Read (buffer, 0, BufferSize)) > 0)
                {
                    output.Write (buffer, 0, len);
                }
            }
        }
    }
}
```

请注意，这个示例使用TextReader和TextWriter带有流参数的构造函数。还有一些构造函数采用文件名作为参数，这样你就不必在你的代码中手动开启一个`FileStream`。其他参数，如缓冲区大小和是否检测BOM（如果存在），都是可用的——详细内容请查阅文档。最后，从.NET 2.0开始，你也应该去看看[File](https://docs.microsoft.com/en-us/dotnet/api/system.io.file)类提供的各种便利方法。

## 困难的部分

好了，这些就是Unicode的基础知识。还有很多额外的部分，其中一些已经也有所涉及，但是大家应该意识到了，这些内容不大可能和实际的应用有关联，也不值得去做整理。我并没有对此提供任何通用的技术手段或指导原则——我只是想让大家意识到它的存在。这也绝不是一个详尽的清单——这些只是一些令人讨厌的部分。重要的是要认识到，这里的很多难题并不是Unicode协会的错——就像日期和时间以及其他任何数字的国际化问题一样，人类在其历史过程中就已经陷入了一个的棘手局面。

### 文化敏感性的搜索和变化

这些内容在我关于.NET字符串处理的文章([原文](https://csharpindepth.com/articles/Strings#culture) [译文](/2021/01/18/String/#文化与国际化的怪事))中有所涉及。

### 代理对

现在Unicode有超过65536个字符，无法仅用两个字节来全部表示。这意味着一个.NET `char`值无法存储所有可能的值。UTF-16使用的解决方案是代理对：使用一对16位值，每个值在0xd800和0xdfff之间。换句话说，两个“排好序”的字符组成一个“真实”的字符。(UCS-4和UTF-32通过使用范围更广的值来完全解决这个问题——当使用4个字节表示时，就可以把所有可能的字符都涵盖进去。) 这是一个令人头疼的问题——这意味着10个字符组成的字符串实际上可以代表5到10个“真正的”Unicode字符。很多年前，大多数不涉及科学/数学符号和汉字的应用程序都不可能需要太过担心这个问题——但表情符号的出现，大大改变了这种情况。

### 组合字符

并非所有的字符都会在屏幕上绘制一个字符。一个有重音的字符可以表示为：无重音的字符和一个重音字符的组合字符。有些GUI系统会支持组合字符，有些则不支持——你的判断会影响你的应用程序。

### 规范化

一部分原因，是因为有像组合字符这样的情况，就会在某种情形下出现多个字符表示一个单一字符的情况。字符序列可以通过尽可能使用组合字符或尽可能避免使用组合字符进行规范化。你的应用程序会将表示同一个实际字符的两个不同字符序列视作相同的吗？你所需要的任意组件是否依赖于以某种特定方式归一化的序列？

> 本文是对[Unicode and .NET](https://csharpindepth.com/articles/Unicode)这篇文章的翻译，作者是著有[C# in Depth](https://csharpindepth.com/)的大神[Jon Skeet](https://jonskeet.uk/)。非文章原文或本人对某段文字理解，会以斜体 *个人理解：xxx* 进行标注。本人翻译能力有限，强烈建议大家去看原版！
