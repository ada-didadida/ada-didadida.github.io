var volume = 0;
var actualVolume = 0;
var settleVolume = 0;
var actualPrice = 0;
function OnSizeChange()
{
    var width = parseFloat($("#width").val());
    var height = parseFloat($("#height").val());
    var length = parseFloat($("#length").val());

    var num = parseFloat($("#count").val());

    volume = width * height * length / 1000000000 * num;
    $("#volume").val(volume.toFixed(3));
    $("#volume").change();
}

function OnPriceChange()
{
    var unitPirce = parseFloat($("#unitPrice").val());

    var price = unitPirce * volume;
    $("#totalPrice").val(price.toFixed(0));
}

function OnActualSizeChange()
{
    var width = parseFloat($("#actualWidthNum").val());
    var height = parseFloat($("#actualHeightNum").val());
    var length = parseFloat($("#actualLengthNum").val());

    var num = parseFloat($("#actualCount").val());

    actualVolume = width * height * length / 1000000000 * num;
    $("#actualVolumeNum").val(actualVolume.toFixed(3));
    $("#actualVolumeNum").change();
}

function OnActualPriceChange()
{
    var unitPirce = parseFloat($("#actualUnitPrice").val());

    actualPrice = unitPirce * actualVolume;
    $("#actualTotalPrice").val(actualPrice.toFixed(0));
}

function OnSettleSizeChange()
{
    var width = parseFloat($("#settleWidthNum").val());
    var height = parseFloat($("#settleHeightNum").val());
    var length = parseFloat($("#settleLengthNum").val());

    var num = parseFloat($("#actualCount").val());

    settleVolume = width * height * length / 1000000000 * num;
    $("#settleVolumeNum").val(settleVolume.toFixed(3));
    $("#settleVolumeNum").change();

    var settleUnitPrice = actualPrice / settleVolume;
    $("#settleUnitPrice").val(settleUnitPrice.toFixed(2));
}

var state = 0;
function FakeStateSwitch()
{
    if (state == 0) 
    {
        $("#beforeTransferText").html("实际单价");
        $("#afterTransferText").html("虚方单价");
        state = 1;   
    }
    else
    {
        $("#beforeTransferText").html("虚方单价");
        $("#afterTransferText").html("实际单价");
        state = 0;
    }
}

function FakePriceTransfer()
{
    var width = parseFloat($("#fakeWidthNum").val());
    var height = parseFloat($("#fakeHeightNum").val());
    var length = parseFloat($("#fakeLengthNum").val());

    var beforePriceNum = parseFloat($("#beforTransfer").val());

    var fakeSize = 50 * 100 * length / 1000000000;
    var realSize = width*height*length/1000000000;

    var afterPrice = 0;

    if (state == 0) 
    {
        var onePrice = beforePriceNum * fakeSize;
        
        var afterPrice = onePrice / realSize;
    }
    else
    {
        var onePrice = beforePriceNum * realSize;
        
        var afterPrice = onePrice / fakeSize;
    }

    $("#afterTransfer").val(afterPrice.toFixed(2));
}

function ReadSizeJson()
{
    $.getJSON("./size.json", function(data)
    {
        console.log(data);
        //尺寸列表
        $.each(data["width"], function(index, content)
        {
            $("#widthList").append("<option value=\""+content+"\"></option>");
            $("#actualWidth").append("<option value=\""+content+"\"></option>");
            $("#settleWidth").append("<option value=\""+content+"\"></option>");
            $("#fakeWidth").append("<option value=\""+content+"\"></option>");
        });
        $.each(data["height"], function(index, content)
        {
            $("#heightList").append("<option value=\""+content+"\"></option>");
            $("#actualHeight").append("<option value=\""+content+"\"></option>");
            $("#settleHeight").append("<option value=\""+content+"\"></option>");
            $("#fakeHeight").append("<option value=\""+content+"\"></option>");
        });
        $.each(data["length"], function(index, content)
        {
            $("#lengthList").append("<option value=\""+content+"\"></option>");
            $("#actualLength").append("<option value=\""+content+"\"></option>");
            $("#settleLength").append("<option value=\""+content+"\"></option>");
            $("#fakeLength").append("<option value=\""+content+"\"></option>");
        });
    })
}

$(document).ready(ReadSizeJson);