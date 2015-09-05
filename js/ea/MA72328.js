var sinaUrlPre = "http://stock2.finance.sina.com.cn/futures/api/json.php/IndexService.getInnerFuturesDailyKLine?symbol=";//访问sina url，获得日K数据
var sinaUrlPreIF = "http://stock2.finance.sina.com.cn/futures/api/json.php/CffexFuturesService.getCffexFuturesDailyKLine?symbol=";
var maxLever = 5;//最大杠杆
var totalCanUsePerProductWithLever =0;//带杠杆，每个品种可用资金
var LVCFMT_LEFT=0x0000 // 脚本标签的文本靠左排列
var LVCFMT_RIGHT=0x0001 // 脚本标签的文本靠右排列
var LVCFMT_CENTER=0x0002 // 脚本标签的文本居中排列
var dailyKLine={};//日K数据，从sina获得，并把今日数据push到数组的尾部
var arrayProductIDs;//=["CF","FG","MA","OI","RM","SR","TA","TC"]//操作品种
var pIDs={}//交易品种->主力合约
var map_InstrumentID_ProductID={}//合约ID->品种ID对应关系
var map_ProductID_InstrumentID={}//品种ID->合约ID对应关系
var map_ProductID_ExchangeID={}//品种ID->交易所ID对应关系
var MarketData={}//最新的数据，从行情服务器获得
var map_InstrumentInfo={}//合约信息，查询合约是获得
var initDataFromSinaFinished={}//从sina初始化数据是否已完成
var investorPosition={}//持仓
var listInstrument=[]//脚本标签的行，计算主力合约时加入，查询持仓时，如果不是主力合约，也加入
var map_MainInstrumentID_RowIndex={};//主力合约对应的行号
var tradingAccount={}//账号信息
///TFtdcPositionDateType是一个持仓日期类型
var THOST_FTDC_PSD_Today ='1';///今日持仓
var THOST_FTDC_PSD_History ='2';///历史持仓
function getStringPositionDateType(_PositionDate){
	if (_PositionDate == THOST_FTDC_PSD_Today)return "今日持仓";
	else if (_PositionDate == THOST_FTDC_PSD_History)return "历史持仓";
	return "未知";
}
///TFtdcPosiDirectionType是一个持仓多空方向类型
var THOST_FTDC_PD_Net ='1'///净
var THOST_FTDC_PD_Long ='2'///多头
var THOST_FTDC_PD_Short ='3'///空头
function getStringPosiDirection(posiDirection){
	if (posiDirection == THOST_FTDC_PD_Net)return "净";
	else if (posiDirection == THOST_FTDC_PD_Long)return "多头";
	else if (posiDirection == THOST_FTDC_PD_Short)return "空头";
	return "未知";
}
//工具函数，输出对象详细信息
function getDetail(obj){
	var ret="[";
	for(index in obj){
		ret += index + "=" + obj[index] + " , ";
	}
	ret = ret.substring(0,ret.length-2) + "]";	
	return ret;
}
//工具函数，月份前面补0
function pad(num, n) {
    var len = num.toString().length;
    while(len < n) {
        num = '0' + num;
        len++;
    }
    return num;
}
//计算推荐手数
function calcPositionSuggest(InstrumentID){
	var _vm = map_InstrumentInfo[InstrumentID].VolumeMultiple;//print("VolumeMultiple:"+InstrumentID+" "+_vm)
	var _lastPrice = MarketData[InstrumentID] .LastPrice;//print("最新价格:"+InstrumentID+" "+_lastPrice)
	var _num = totalCanUsePerProductWithLever/_lastPrice/_vm;//print("推荐手数:"+InstrumentID+" --->"+_num)
	jstabUpdateItem(InstrumentID,"推荐手数",_num.toFixed(2));
}
//算出每个品种带杠杆最多可用资金，然后计算所有主力合约推荐手数
function calcAllPositionSuggest(){
	print("计算主力合约推荐手数：")
	totalCanUsePerProductWithLever = tradingAccount.Balance*maxLever/arrayProductIDs.length;//带杠杆，每个品种可用资金
	for(_p in pIDs){
		calcPositionSuggest(pIDs[_p]);
	}
}
//查询投资者账户响应
function onRspQryTradingAccount(data){
	print("查询投资者账户响应:"+getDetail(data));
	tradingAccount=data;
	calcAllPositionSuggest();
}
///登录请求响应
function onRspUserLogin(data){
	print("登录成功"
	+","+ data.BrokerName+","+ data.BrokerID+","+ data.InvestorID+" SystemName："+ data.SystemName
	+"交易日："+ data.TradingDay+"上期所时间："+ data.SHFETime+"大商所时间："+ data.DCETime
	+"郑商所时间："+ data.CZCETime+"中金所时间："+ data.FFEXTime+"能源中心时间："+ data.INETime+"前置编号："+ data.FrontID
	
	+"最大报单引用："+ data.MaxOrderRef);
}
//根据传进来的InstrumentID，判断该品种是否有持仓
function hasPositionByProductID(InstrumentID){
	//所属品种
	var _pID = getProductIDByInstrumentID(InstrumentID);
	//print("InstrumentID:"+InstrumentID+" _pID:"+_pID)
	//print("investorPosition:"+getDetail(investorPosition[InstrumentID]))
	for (p in investorPosition){
		//print("------"+investorPosition[p].InstrumentID+" p.Position:"+investorPosition[p].Position)
		//如果遍历到的持仓的品种，就是该参数合约的品种
		if(getProductIDByInstrumentID(p) ==_pID && investorPosition[p].Position>0){
			return true;
		}
	}
	return false;
}
///请求查询投资者持仓响应
function onRspQryInvestorPosition(data){
	print("持仓："+getDetail(data))
	investorPosition[data.InstrumentID] = data;
	
	
	var nIndex=-1;
	//如果不是主力合约则添加一行，主力合约，已经添加过了。
	if(pIDs[getProductIDByInstrumentID(data.InstrumentID) ] !=data.InstrumentID){
		nIndex = jstabInsertItem(data.InstrumentID,[0,0,255]);
		
		//该合约的总持仓
		jstabUpdateItem(data.InstrumentID,"持仓量",MarketData[data.InstrumentID].OpenInterest);
		//访问数据
		var sinaSymbol =data.InstrumentID;
		if(map_ProductID_ExchangeID[getProductIDByInstrumentID(data.InstrumentID) ]=="CZCE"){
			var _info = map_InstrumentInfo[data.InstrumentID];
			var sinaSymbol = obj+_info.DeliveryYear.toString().substring(2,4) +pad(_info.DeliveryMonth,2);
		}
		getDailyKLine (sinaSymbol,data.InstrumentID);
		listInstrument.push(data.InstrumentID)
	//如果是主力合约
	}else{
		nIndex = map_MainInstrumentID_RowIndex[data.InstrumentID] 
	}
	
	
	jstabUpdateItem(nIndex,"持仓日期",getStringPositionDateType(data.PositionDate));
	jstabUpdateItem(nIndex,"上日持仓",data.YdPosition);
	jstabUpdateItem(nIndex,"今日持仓",data.Position);

	if (data.PosiDirection == THOST_FTDC_PD_Long){
		jstabUpdateItem(nIndex,"多空方向",getStringPosiDirection(data.PosiDirection),[200,0,0],[255,255,255]);
	}else if (data.PosiDirection ==THOST_FTDC_PD_Short ){
		jstabUpdateItem(nIndex,"多空方向",getStringPosiDirection(data.PosiDirection),[0,200,0],[255,255,255]);
	}else{
		jstabUpdateItem(nIndex,"多空方向",data.PosiDirection+getStringPosiDirection(data.PosiDirection));
	}
	jstabUpdateItem(nIndex,"开仓量",data.OpenVolume);
	jstabUpdateItem(nIndex,"平仓量",data.CloseVolume);
	//可以计算均线数据了
	if(data.bIsLast){
		for(item in listInstrument){
			calcMA(listInstrument[item],"");
		}
	}
}

///请求查询合约响应
function onRspQryInstrument(data){
	//print(data.ProductID)
	//该方法只能判断自有属性是否存在，对于继承属性会返回false。
	if(pIDs.hasOwnProperty(data.ProductID)){
		//print(data.InstrumentID+" "+data.ProductID+" "+data.ExchangeID+" "+data.InstrumentName+" "+data.VolumeMultiple+" "+data.PriceTick);
		//记住对照关系
		map_InstrumentID_ProductID[data.InstrumentID] = data.ProductID;
		map_ProductID_InstrumentID[data.ProductID].push(data.InstrumentID);
		map_ProductID_ExchangeID[data.ProductID]=data.ExchangeID;//每次覆盖下无所谓
		
		map_InstrumentInfo[data.InstrumentID]=data;
	}
	if(data.bIsLast){
		print("查询合约结束");
		print("合约到品种对应关系："+getDetail(map_InstrumentID_ProductID))
		print("品种到合约对应关系："+getDetail(map_ProductID_InstrumentID))
		print("品种到交易所对应关系："+getDetail(map_ProductID_ExchangeID))
		print("合约详细信息："+getDetail(map_InstrumentInfo))
	}

}
//计算主力合约
function calcMainByProductID(pID){
	var maxOpenInterest = 0;
	var maxOpenInterestInstrumentID="";
	for(_index in map_ProductID_InstrumentID[pID]){//遍历数组
				var _InstrumentID = map_ProductID_InstrumentID[_productID][_index];
				//print(_instru +" : "+getDetail(MarketData[_instru]));
				var _OpenInterest = MarketData[_InstrumentID].OpenInterest;
				if(_OpenInterest>maxOpenInterest){
					maxOpenInterest = _OpenInterest
					maxOpenInterestInstrumentID = _InstrumentID;
				}
	}
	//print(pID+" 主力合约 : "+maxOpenInterestInstrumentID+" 主力合约持仓： "+maxOpenInterest);
	pIDs[pID]=maxOpenInterestInstrumentID;
	var nIndex = jstabInsertItem(maxOpenInterestInstrumentID);
	jstabUpdateItem(maxOpenInterestInstrumentID,"是否主力","是");
	jstabUpdateItem(maxOpenInterestInstrumentID,"持仓量",maxOpenInterest);
	listInstrument.push(maxOpenInterestInstrumentID)
	//记住这个主力合约的行号，等持仓信息过来，还要根据行号更新别的列
	map_MainInstrumentID_RowIndex[maxOpenInterestInstrumentID] = nIndex;
}
//计算主力合约
function calcMain(){
	print("开始计算主力合约")
	//print(getDetail(MarketData));
	for(_productID in map_ProductID_InstrumentID){
		calcMainByProductID(_productID);
	}
	print("pIDs:"+getDetail(pIDs))
	//访问sina，获取主力合约的历史日K
	//访问sina，获取主力合约的历史日K
	for(obj in pIDs){
		var _InstrumentID = pIDs[obj];
		var sinaSymbol =_InstrumentID;
		if(map_ProductID_ExchangeID[obj]=="CZCE"){
			var _info = map_InstrumentInfo[_InstrumentID];
			var sinaSymbol = obj+_info.DeliveryYear.toString().substring(2,4) +pad(_info.DeliveryMonth,2);
		}
		getDailyKLine (sinaSymbol,_InstrumentID) ;
	}
}
//从合约得到品种
function getProductIDByInstrumentID(instru){
	return map_InstrumentID_ProductID[instru];
}
//合约是否属于操作品种
function isNeedProcessByInstrumentID(instru){
	return pIDs.hasOwnProperty(getProductIDByInstrumentID(instru));
}
//接收TD传过来的实时行情
function onRspQryDepthMarketData(data){
	//根据合约ID判断，是否为预设交易品种相关的合约
	if(isNeedProcessByInstrumentID(data.InstrumentID)){
		MarketData[data.InstrumentID] = data;
	}	
	if(data.bIsLast){//计算主力合约
		print("TD行情："+getDetail(MarketData))
		calcMain();
	}
}
//计算均线，得到操作提示
function calcMA(InstrumentID,UpdateTime){
	var MA7 = MA(InstrumentID,7);
	var MA23 = MA(InstrumentID,23);
	var MA28 = MA(InstrumentID,28);
	jstabUpdateItem(InstrumentID,"MA7",MA7.toFixed(2));
	jstabUpdateItem(InstrumentID,"MA23",MA23.toFixed(2));
	jstabUpdateItem(InstrumentID,"MA28",MA28.toFixed(2));
	jstabUpdateItem(InstrumentID,"JS",UpdateTime);
	if(hasPositionByProductID(InstrumentID)){
		jstabUpdateItem(InstrumentID,"备注","已有持仓",[255,0,0],[0,255,0]);
		jstabUpdateItem(InstrumentID,"操作提示","-");
		return;
	}
	var days = dailyKLine[InstrumentID];
	var _close = days[days.length-1][4];
	
	var _action = "-";	
	if(_close>MA7 && MA7>MA28){
		_action="买入";
	}
	else if(_close<MA7 && MA7<MA28){
		_action="卖出";
	}
	jstabUpdateItem(InstrumentID,"备注","-");
	jstabUpdateItem(InstrumentID,"操作提示",_action);	
}
//接收MD传过来的实时行情
function onRtnDepthMarketData(data){

	MarketData[data.InstrumentID] = data;
	//如果没有加载历史数据，返回
	if(!initDataFromSinaFinished[data.InstrumentID]){
		//print(data.InstrumentID+"没有加载历史数据");
		return;
	}
	jstabUpdateItem(data.InstrumentID,"最新价",data.LastPrice.toFixed(2));
	var days = dailyKLine[data.InstrumentID];
	if(days.length==0){
		print(data.InstrumentID+" 数据为0，暂不处理");
		return;
	}
	days[days.length-1][1]=data.OpenPrice;
	days[days.length-1][2]=data.HighestPrice;
	days[days.length-1][3]=data.LowestPrice;
	days[days.length-1][4]=data.LastPrice;
	calcMA(data.InstrumentID,data.UpdateTime);
}
//访问web，得到历史数据
function getDailyKLine (InstrumentIDSina,InstrumentID) {
	if (InstrumentIDSina.substring(0,2)=="TC"){
		InstrumentIDSina=InstrumentIDSina.replace("TC","ZC");
	}
	print(sinaUrlPre+InstrumentIDSina)
	getFromUrl(sinaUrlPre+InstrumentIDSina,processHQFuturesData,[InstrumentID]);	
	
}
//访问web，得到历史数据，股指期货url不同于商品期货
function getDailyKLineIF (InstrumentIDSina,InstrumentID) {
	getFromUrl(sinaUrlPreIF+InstrumentIDSina,processHQFuturesData,[InstrumentID]);	
}

function onInit (_arrayProductIDs) {
	
	print("===onInit===============================================");
	print("参数个数："+onInit.length);
	print("实际个数："+arguments.length);
	for (var i=0; i<arguments.length; i++)
	{
		print("参数"+i+"："+arguments[i]);
	}
	if(onInit.length!=arguments.length){
		print("参数个数不符!",[255,0,0]);
		return;
	}
	
	arrayProductIDs = eval(_arrayProductIDs);
	//return;
	for(var i in arrayProductIDs){//每个品种的全部可交易合约是个数组
		map_ProductID_InstrumentID[arrayProductIDs[i]]=[];
	}
	for(var i in arrayProductIDs){//pIDs将品种ID对应到主力合约ID
		pIDs[arrayProductIDs[i]]="";
	}
	jstabInitList();//初始化脚本标签
	jstabInsertColumn("合约名称",0,60);
	jstabInsertColumn("是否主力",0,60);
	jstabInsertColumn("持仓量",LVCFMT_RIGHT,60);
	jstabInsertColumn("最新价",LVCFMT_RIGHT,70);
	jstabInsertColumn("持仓日期",LVCFMT_RIGHT,70);
	jstabInsertColumn("上日持仓",LVCFMT_RIGHT,70);
	jstabInsertColumn("今日持仓",LVCFMT_RIGHT,70);
	jstabInsertColumn("多空方向",LVCFMT_RIGHT,70);
	jstabInsertColumn("开仓量",LVCFMT_RIGHT,70);
	jstabInsertColumn("平仓量",LVCFMT_RIGHT,70);
	jstabInsertColumn("MA7",LVCFMT_RIGHT,70);
	jstabInsertColumn("MA23",LVCFMT_RIGHT,70);
	jstabInsertColumn("MA28",LVCFMT_RIGHT,70);
	jstabInsertColumn("推荐手数",LVCFMT_RIGHT,70);
	jstabInsertColumn("操作提示",LVCFMT_RIGHT,70);
	jstabInsertColumn("JS",LVCFMT_RIGHT,70);
	jstabInsertColumn("备注",LVCFMT_RIGHT,70);
	print("===onInit end===============================================");
}
//计算MA
function MA(InstrumentID,n) {
	var days = dailyKLine[InstrumentID];
	if(!days){
		print(InstrumentID+" 没有数据!days");
		return 0;
	}
	if(!days.length){
		print(InstrumentID+" 没有数据!days.length");
		return 0;
	}
	if(days.length<n){
		print(InstrumentID+" 数据天数小于："+n);
		return -1;
	}
	var num=0;
	for (var i = days.length-n; i < days.length; i++) {
		num=num+parseFloat(days[i][4]);
	}
	return (num/n);
}
//处理从sina得到的历史数据
function processHQFuturesData (jsonStr,InstrumentID) {
	print("收到数据："+InstrumentID);
	var jsonObj = eval("("+jsonStr+")");
	dailyKLine[InstrumentID] = jsonObj;
	var _date = jsonObj[jsonObj.length-1][0];
	var _close = parseFloat(jsonObj[jsonObj.length-1][4]);
	var _marketData = MarketData[InstrumentID]
	var todayStr = _marketData.TradingDay;
	todayStr = todayStr.substring(0,4)+"-"+ todayStr.substring(4,6)+"-"+ todayStr.substring(6,8);
	//sina数据，可能不会有当天的数据
	if(todayStr!=_date){
		dailyKLine[InstrumentID] .push([todayStr,_marketData.OpenPrice,_marketData.HighestPrice,_marketData.LowestPrice,_marketData.LastPrice]);
		var _date2 = jsonObj[jsonObj.length-1][0];
		var _close2 = parseFloat(dailyKLine[InstrumentID][dailyKLine[InstrumentID].length-1][4]);
	}
	initDataFromSinaFinished[InstrumentID]=true;//记住此合约已经补齐今日数据
}
