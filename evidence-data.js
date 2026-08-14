(function () {
  "use strict";

  const tonglanEdition = {
    title: "《成都通览》",
    author: "傅崇矩",
    sourceType: "public-domain",
    publisher: "天地出版社",
    publicationYear: "2014",
    editionStatement: "2014年3月第1版第1次印刷",
    edition: "天地出版社，2014年3月第1版第1次印刷",
    rightsStatement: "公版原著（1909年）",
    verification: "原页目视核验",
    verificationCode: "visually_verified"
  };

  const jiexiangEdition = {
    title: "《成都街巷志》",
    author: "袁庭栋",
    sourceType: "in-copyright",
    publisher: "四川教育出版社",
    publicationYear: "2010",
    editionStatement: "2010年4月第1版第1次印刷",
    edition: "四川教育出版社，2010年4月第1版第1次印刷",
    rightsStatement: "当代出版物，合理引用",
    verification: "PDF文字层与原页复核",
    verificationCode: "text_layer_verified"
  };

  const projectEdition = {
    title: "项目点位核验记录",
    author: "图绘成都项目组",
    sourceType: "project-note",
    publisher: "图绘成都项目组",
    publicationYear: "2026",
    editionStatement: "项目内部核验记录",
    edition: "依据馆藏古图方位、水系与点位资料形成的研究记录",
    rightsStatement: "项目研究记录",
    verification: "项目记录，仍需继续复核",
    verificationCode: "project_note"
  };

  const records = [
    {
      id: "jiuyanqiao_map_01",
      pointId: "jiuyanqiao",
      ...projectEdition,
      pageLabel: "古图点位记录",
      grade: "B",
      excerpt: "古图题作“九贤桥”，今日通称“九眼桥”。",
      proves: "能够证明馆藏古图存在“九贤桥”这一标注，并构成与今日九眼桥进行空间比对的线索。",
      limits: "不能据此断言“九贤桥”就是今日九眼桥，也不能解释“贤/眼”为避讳、异体或讹写。",
      note: "此条为项目核验记录，不冒充原书页证据。"
    },
    {
      id: "jiuyanqiao_tonglan_p33_01",
      pointId: "jiuyanqiao",
      ...tonglanEdition,
      pageStart: 33,
      pageEnd: 33,
      originalPage: "21",
      grade: "A",
      excerpt: "九眼桥（古名洪济桥，明名锁江桥，九洞……乾隆五十三年始改名九眼桥）。",
      proves: "能够证明《成都通览》把洪济桥、锁江桥、九眼桥置于同一桥名沿革中，并记录九洞形制与乾隆五十三年的改名说法。",
      limits: "不能单独证明古图“九贤桥”与九眼桥为同一地点；省略号处的桥梁尺寸须回看原页。"
    },
    {
      id: "jiuyanqiao_jiexiang_p126_01",
      pointId: "jiuyanqiao",
      ...jiexiangEdition,
      pageStart: 126,
      pageEnd: 126,
      grade: "A",
      excerpt: "从明万历二十一年（1593年）起……花了五年时间在这里建成了一座宏伟的石拱桥。",
      proves: "能够支持1593年起由余一龙主持建桥、历时五年、初名洪济桥和九洞石拱形制等记载。",
      limits: "书中关于唐宋时期可能已有桥梁属于作者推测，不能并入确定史实。"
    },
    {
      id: "jiuyanqiao_jiexiang_p127_128_01",
      pointId: "jiuyanqiao",
      ...jiexiangEdition,
      pageStart: 127,
      pageEnd: 128,
      grade: "A",
      excerpt: "1986年在老桥上游14米处新建了半立交的新九眼桥……遂在1992年被拆除。",
      proves: "能够支持旧桥多次维修、1986年新桥建成、1992年旧桥拆除及2001年仿古桥主体建成的近现代变迁。",
      limits: "2001年仿古桥不是明清旧桥原物，也不在旧桥原址。"
    },
    {
      id: "jiuyanqiao_jiexiang_p131_01",
      pointId: "jiuyanqiao",
      ...jiexiangEdition,
      pageStart: 131,
      pageEnd: 131,
      grade: "A",
      excerpt: "九眼桥南岸一带长期都是锦江中的重要水码头。",
      proves: "能够支持九眼桥南岸长期承担水运码头功能，并在近现代形成劳务集散空间的叙述。",
      limits: "该页说明城市生活功能，不用于证明桥名文字关系。"
    },
    {
      id: "wuhouci_tonglan_p40_01",
      pointId: "wuhouci",
      ...tonglanEdition,
      pageStart: 40,
      pageEnd: 40,
      grade: "A",
      excerpt: "昭烈陵，在武侯祠内，汉昭烈帝之衣冠陵也。",
      proves: "能够证明清末地方文献曾把武侯祠内昭烈陵理解为刘备衣冠陵。",
      limits: "这是历史文献中的旧说，不等同于现代考古结论。"
    },
    {
      id: "wuhouci_tonglan_p40_02",
      pointId: "wuhouci",
      ...tonglanEdition,
      pageStart: 40,
      pageEnd: 40,
      grade: "A",
      excerpt: "诸葛铜鼓，在武侯祠之武侯神座前，一大一小，武侯南征时之物。",
      proves: "能够证明清末文献记录祠内曾有大小两面铜鼓，并将其附会为诸葛亮南征遗物。",
      limits: "器物年代与来源属于旧时传说性归属，不能写成已经证实的考古事实。"
    },
    {
      id: "wuhouci_jiexiang_p299_300_01",
      pointId: "wuhouci",
      ...jiexiangEdition,
      pageStart: 299,
      pageEnd: 300,
      grade: "A",
      excerpt: "能攻心则反侧自消从古知兵非好战；不审势即宽严皆误后来治蜀要深思。",
      proves: "能够支持1902年赵藩撰写“攻心联”及其与当时四川政治语境的关系。",
      limits: "标点为整理者添加，引用完整联文时应以原页连续排印为准。"
    },
    {
      id: "wuhouci_jiexiang_p678_01",
      pointId: "wuhouci",
      ...jiexiangEdition,
      pageStart: 678,
      pageEnd: 678,
      grade: "A",
      excerpt: "刘沅在道光二十九年（1849年）主持了对武侯祠中雕塑的调整与重塑。",
      proves: "能够支持现见祠内塑像格局与1849年刘沅主持调整重塑之间的关系。",
      limits: "不能由此把所有现存塑像都认定为1849年新塑。"
    },
    {
      id: "wenshuyuan_jiexiang_p676_01",
      pointId: "wenshuyuan",
      ...jiexiangEdition,
      pageStart: 676,
      pageEnd: 676,
      grade: "A",
      excerpt: "在清代是与大慈寺、文殊院、石犀寺齐名的成都四大寺院。",
      proves: "能够支持清代成都四大寺院的并列关系。",
      limits: "本页以延庆寺为叙述主体，不用于证明文殊院的早期创建年代。"
    },
    {
      id: "wenshuyuan_jiexiang_p708_709_01",
      pointId: "wenshuyuan",
      ...jiexiangEdition,
      pageStart: 708,
      pageEnd: 709,
      grade: "A",
      excerpt: "酱园公所街、五岳宫街、文殊院街这三条从东到西相连的街道在清代是一条街，总称为头福街。",
      proves: "能够支持头福街与文殊院街、进香路线及清末民国街名分化之间的关系。",
      limits: "不能由街名沿革反推寺院全部历史范围。"
    },
    {
      id: "wenshuyuan_project_01",
      pointId: "wenshuyuan",
      ...projectEdition,
      pageLabel: "点位研究说明",
      grade: "B",
      excerpt: "现有介绍侧重寺院、街名与进香路线关系，不展开未经核实的早期创建年代。",
      proves: "说明当前知识库选择了哪些可由页码支持的材料。",
      limits: "早期创建年代和现存建筑沿革仍需另查寺志或文保资料。"
    },
    {
      id: "qingyanggong_tonglan_p39_01",
      pointId: "qingyanggong",
      ...tonglanEdition,
      pageStart: 39,
      pageEnd: 39,
      grade: "A",
      excerpt: "青羊宫，在城外西南五里，唐时古刹也，祀李耳。",
      proves: "能够证明《成都通览》将青羊宫记作城外西南五里的道教古迹，并记录铜羊等旧时认识。",
      limits: "“唐时古刹”和老子遗迹是该书所记录的历史认识，不等于现代考古定论。"
    },
    {
      id: "qingyanggong_jiexiang_p529_01",
      pointId: "qingyanggong",
      ...jiexiangEdition,
      pageStart: 529,
      pageEnd: 529,
      grade: "A",
      excerpt: "唐僖宗中和三年（883年），经过扩建之后正式命名为青羊宫。",
      proves: "能够支持883年扩建后正式称青羊宫，以及现存建筑经历清代重建扩建的叙述。",
      limits: "汉代青羊肆与老子化青羊属于引书与传说系统，回答时必须注明“相传”。"
    },
    {
      id: "qingyanggong_jiexiang_p530_01",
      pointId: "qingyanggong",
      ...jiexiangEdition,
      pageStart: 530,
      pageEnd: 530,
      grade: "A",
      excerpt: "单角青羊是清雍正元年（1723年）……张鹏翮从北京购得赠给青羊宫的。",
      proves: "能够支持单角铜羊1723年获赠、双角铜羊1829年在成都铸造的记载。",
      limits: "铜羊原属贾似道府或严嵩家的说法，原书也只作“一说”。"
    },
    {
      id: "qingyanggong_jiexiang_p536_538_01",
      pointId: "qingyanggong",
      ...jiexiangEdition,
      pageStart: 536,
      pageEnd: 538,
      grade: "A",
      excerpt: "每年都在青羊宫与二仙庵中举行，并且还具有……游赏、商贸加美食相结合的明显特点。",
      proves: "能够支持青羊宫花会由踏青、庙会与商贸结合，并在清末转化为劝工、劝业活动的叙述。",
      limits: "此条用于说明公共文化功能，不用于证明早期宫观创建传说。"
    },
    {
      id: "mancheng_tonglan_p37_01",
      pointId: "mancheng",
      ...tonglanEdition,
      pageStart: 37,
      pageEnd: 37,
      grade: "A",
      excerpt: "满城一名内城，在府城西，康熙五十七年所筑。",
      proves: "能够支持《成都通览》关于满城方位、五门、官街和兵丁胡同等清末记录。",
      limits: "筑城年份及街巷数量与《成都街巷志》所据材料有差异，不能只取一说。"
    },
    {
      id: "mancheng_jiexiang_p28_01",
      pointId: "mancheng",
      ...jiexiangEdition,
      pageStart: 28,
      pageEnd: 28,
      grade: "A",
      excerpt: "这座城中之城从康熙六十年（1721年）动工，一直修了20多年才全部完工。",
      proves: "能够支持1718年安排驻防与1721年驻防新城动工之间的区分。",
      limits: "应与《成都通览》“康熙五十七年所筑”的简略表述并列保留。"
    },
    {
      id: "mancheng_jiexiang_p29_01",
      pointId: "mancheng",
      ...jiexiangEdition,
      pageStart: 29,
      pageEnd: 29,
      grade: "A",
      excerpt: "满城的城墙周长约2.7公里，城内有八旗官街8条、兵丁驻地街巷42条、通道5条。",
      proves: "能够支持书中据《成都满蒙族志》记录的满城范围与街巷结构。",
      limits: "清代满城街道数目存在不同记载，不能把42条作为唯一确定数字。"
    },
    {
      id: "mancheng_jiexiang_p32_01",
      pointId: "mancheng",
      ...jiexiangEdition,
      pageStart: 32,
      pageEnd: 32,
      grade: "A",
      excerpt: "由于满城的最初功能就是一座大兵营，所以就只有住房、官府与仓库。",
      proves: "能够支持清代满城的驻防功能、商业限制及1912年后拆墙过程。",
      limits: "不能把当时满城的全部空间等同于今天的宽窄巷子景区。"
    },
    {
      id: "mancheng_jiexiang_p883_884_01",
      pointId: "mancheng",
      ...jiexiangEdition,
      pageStart: 883,
      pageEnd: 884,
      grade: "A",
      excerpt: "井巷子与邻近的宽巷子、窄巷子一道……进行了整体的改造。",
      proves: "能够支持井巷子的旧名变化和宽、窄、井三巷的近现代改造。",
      limits: "三条巷子只是满城区域的局部遗存，不能代表满城整体。"
    },
    {
      id: "mancheng_project_conflict_01",
      pointId: "mancheng",
      ...projectEdition,
      pageLabel: "文献冲突记录",
      grade: "B",
      excerpt: "两书关于满城始建表述和街巷数量存在差异。",
      proves: "能够说明当前知识库没有强行合并互相冲突的年份和街巷数量。",
      limits: "项目记录本身不是新的历史证据，结论仍须回到两书原页。"
    },
    {
      id: "hongpailou_jiexiang_p65_01",
      pointId: "hongpailou",
      ...jiexiangEdition,
      pageStart: 65,
      pageEnd: 65,
      grade: "A",
      excerpt: "家钰的遗体葬于成都外南红牌楼。",
      proves: "只能证明20世纪40年代“成都外南红牌楼”这一地名已经明确使用。",
      limits: "不能证明牌楼的创建年代、形制、用途、毁坏时间或精确原址。"
    },
    {
      id: "hongpailou_jiexiang_outline_01",
      pointId: "hongpailou",
      ...jiexiangEdition,
      pageStart: 1097,
      pageEnd: 1097,
      grade: "C",
      excerpt: "以昔建筑命名……红牌楼北街。",
      proves: "只能作为红牌楼北街与昔日建筑命名关系的间接线索。",
      limits: "只有目录分类，不能据此推定建筑年代、用途、形制或得名故事。"
    },
    {
      id: "hongpailou_project_gap_01",
      pointId: "hongpailou",
      ...projectEdition,
      pageLabel: "研究缺口记录",
      grade: "C",
      excerpt: "与前五个点位相比，红牌楼在这两部书的材料明显不足。",
      proves: "能够说明当前知识库为什么必须限制回答。",
      limits: "明代建牌楼、朝贡接待、茶马互市等说法仍须补查《华阳县志》原文和地方档案。"
    }
  ];

  function sourceKey(record) {
    if (record.title.includes("成都通览")) return "tonglan";
    if (record.title.includes("成都街巷志")) return "jiexiang";
    return "project";
  }

  records.forEach((record) => {
    record.sourceKey = sourceKey(record);
    record.pages = [];

    // 只有公版文献生成并公开扫描页地址；在版权文献只保留书目信息与页码。
    if (record.sourceType === "public-domain" && record.pageStart) {
      for (let page = record.pageStart; page <= (record.pageEnd || record.pageStart); page += 1) {
        record.pages.push({
          page,
          src: `./evidence-pages/${record.sourceKey}-p${page}.jpg`
        });
      }
    }

    record.pageLabel = record.pageLabel || (
      record.pageStart === record.pageEnd
        ? `PDF第${record.pageStart}页`
        : `PDF第${record.pageStart}—${record.pageEnd}页`
    );
  });

  window.TUHUI_EVIDENCE = {
    records,
    byId: Object.fromEntries(records.map((record) => [record.id, record])),
    byPoint: records.reduce((result, record) => {
      (result[record.pointId] ||= []).push(record);
      return result;
    }, {})
  };
})();
