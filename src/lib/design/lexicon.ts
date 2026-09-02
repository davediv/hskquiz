/**
 * THE WORD-BOUNDARY LEXICON — the dictionary an example sentence's pinyin is spelled from.
 *
 * WHY A DESIGN SYSTEM OWNS A WORD LIST. 汉语拼音正词法基本规则 (GB/T 16159) sets pinyin by WORD:
 * 夏天 is `xiàtiān`, never `xià tiān`. For a HEADWORD nothing here is needed — `Word.pinyin`
 * already ships that spelling, because the official list writes it, and `layoutPinyin` just
 * prints the source string. An EXAMPLE SENTENCE is the case a source string cannot cover:
 * `Example.pinyin` ships one bare syllable per character — `xià tiān dào le tiān qì yuè lái
 * yuè rè` — which is not an orthography at all, and no care inside a renderer can recover word
 * boundaries from a string that has none. They have to come from a word list. This is it.
 *
 * WHAT IT IS. Every multi-syllable word the app ships, written `Word.hanzi` = `Word.pinyin`,
 * so the joins, the gaps (不客气 = `bú kèqì`), the apostrophes (女儿 = `nǚ'ér`), the hyphens
 * (五颜六色 = `wǔyán-liùsè`) and the capitals (北京 = `Běijīng`) are the OFFICIAL LIST'S OWN and
 * are re-derived nowhere. `pinyin.spec.ts` reads `src/lib/data/hsk{1..5}.json` and asserts this
 * table is exactly that projection of the corpus — every row present, every spelling identical,
 * nothing invented — so it cannot drift from the data it was taken out of.
 *
 * WHERE IT SHOULD LIVE INSTEAD: the build. `scripts/build-vocab.mjs` derives these boundaries
 * already for `word.pinyin`; if it spelled `example.pinyin` with them too, this file would be
 * deletable and `<Pinyin>` would go back to printing its source unchanged. Until it does, the
 * sentence orthography has to be reconstructed at render time, and this is what it is
 * reconstructed from.
 *
 * COST: 3363 entries, 55 kB of source (~27 kB gzipped) against a 197 kB level chunk.
 *
 * GENERATED — do not hand-edit; `pinyin.spec.ts` compares every row against the corpus and
 * fails when the two drift. To rebuild the rows after the word list changes:
 *
 *     node --input-type=module -e "import{readFileSync}from'node:fs';const s=new Map();
 *     for(let n=1;n<=5;n++)for(const w of JSON.parse(readFileSync('src/lib/data/hsk'+n+'.json')))
 *     if(w.syllables.length>1&&!s.has(w.hanzi))s.set(w.hanzi,w.pinyin);
 *     console.log([...s].sort().map(([h,p])=>h+'='+p).join(';'))"
 */

import type { Syllable } from '$lib/types';
import { segmentPinyin, sourceSeparators } from './tone';

/** `hanzi=pinyin` rows, `;`-separated — a pinyin may contain a space, so a space cannot end a row. */
const TABLE = `
一下儿=yíxiàr;一下子=yíxiàzi;一些=yìxiē;一会儿=yíhuìr;一共=yígòng;一再=yízài;一切=yíqiè;一半=yíbàn;
一口气=yìkǒuqì;一句话=yí jù huà;一向=yíxiàng;一块儿=yíkuàir;一定=yídìng;一带=yídài;一律=yílǜ;
一方面=yìfāngmiàn;一旦=yídàn;一样=yíyàng;一流=yīliú;一点儿=yìdiǎnr;一点点=yì diǎndiǎn;一生=yìshēng;
一直=yìzhí;一致=yízhì;一般=yìbān;一般来说=yìbānláishuō;一起=yìqǐ;一路=yílù;一路平安=yílù-píng'ān;
一路顺风=yílù-shùnfēng;一身=yìshēn;一辈子=yíbèizi;一边=yìbiān;一部分=yí bùfen;万一=wànyī;丈夫=zhàngfu;
上下=shàngxià;上个月=shàng ge yuè;上升=shàngshēng;上午=shàngwǔ;上去=shàngqù;上周=shàng zhōu;
上学=shàngxué;上来=shànglái;上楼=shàng lóu;上次=shàng cì;上涨=shàngzhǎng;上班=shàngbān;
上级=shàngjí;上网=shàngwǎng;上衣=shàngyī;上课=shàngkè;上车=shàng chē;上边=shàngbian;上门=shàngmén;
上面=shàngmiàn;下个月=xià ge yuè;下午=xiàwǔ;下去=xiàqù;下周=xià zhōu;下来=xiàlai;下楼=xià lóu;
下次=xià cì;下班=xiàbān;下课=xiàkè;下车=xià chē;下载=xiàzài;下边=xiàbian;下降=xiàjiàng;下雨=xià yǔ;
下雪=xià xuě;下面=xiàmiàn;不一会儿=bù yíhuìr;不一定=bùyídìng;不久=bùjiǔ;不仅=bùjǐn;不但=búdàn;
不停=bù tíng;不光=bùguāng;不免=bùmiǎn;不利=búlì;不同=bù tóng;不在乎=búzàihu;不够=búgòu;不大=bú dà;
不太=bú tài;不好意思=bù hǎoyìsi;不如=bùrú;不安=bù'ān;不客气=bú kèqi;不对=búduì;不少=bù shǎo;不幸=búxìng;
不得不=bùdébù;不得了=bùdéliǎo;不必=búbì;不敢当=bùgǎndāng;不断=búduàn;不时=bùshí;不易=búyì;不曾=bùcéng;
不止=bùzhǐ;不满=bùmǎn;不然=bùrán;不用=búyòng;不管=bùguǎn;不耐烦=bú nàifán;不能不=bù néng bù;
不良=bùliáng;不行=bùxíng;不要=búyào;不要紧=búyàojǐn;不许=bùxǔ;不论=búlùn;不足=bùzú;不过=búguò;
不错=búcuò;不顾=búgù;专业=zhuānyè;专利=zhuānlì;专家=zhuānjiā;专心=zhuānxīn;专辑=zhuānjí;
专门=zhuānmén;专题=zhuāntí;世界=shìjiè;世界杯=shìjièbēi;世纪=shìjì;业余=yèyú;业务=yèwù;东北=dōngběi;
东南=dōngnán;东方=dōngfāng;东西=dōngxi;东边=dōngbian;东部=dōngbù;两岸=liǎng'àn;两边=liǎngbiān;
严厉=yánlì;严格=yángé;严肃=yánsù;严重=yánzhòng;个人=gèrén;个体=gètǐ;个儿=gèr;个别=gèbié;个子=gèzi;
个性=gèxìng;中介=zhōngjiè;中医=zhōngyī;中午=zhōngwǔ;中华民族=Zhōnghuá Mínzú;中国=Zhōngguó;
中央=zhōngyāng;中奖=zhòngjiǎng;中学=zhōngxué;中学生=zhōngxuéshēng;中小学=zhōng-xiǎoxué;
中年=zhōngnián;中心=zhōngxīn;中文=Zhōngwén;中断=zhōngduàn;中毒=zhòngdú;中秋节=Zhōngqiū Jié;
中级=zhōngjí;中药=zhōngyào;中部=zhōngbù;中间=zhōngjiān;中餐=zhōngcān;丰富=fēngfù;丰收=fēngshōu;
临时=línshí;为主=wéizhǔ;为了=wèile;为什么=wèi shénme;为期=wéiqī;为止=wéizhǐ;为难=wéinán;主人=zhǔrén;
主任=zhǔrèn;主体=zhǔtǐ;主办=zhǔbàn;主动=zhǔdòng;主导=zhǔdǎo;主席=zhǔxí;主张=zhǔzhāng;主意=zhǔyi;
主持=zhǔchí;主管=zhǔguǎn;主要=zhǔyào;主观=zhǔguān;主题=zhǔtí;举办=jǔbàn;举动=jǔdòng;举手=jǔshǒu;
举行=jǔxíng;义务=yìwù;之一=zhīyī;之下=zhīxià;之中=zhīzhōng;之内=zhīnèi;之前=zhīqián;之后=zhīhòu;
之外=zhīwài;之间=zhījiān;乐观=lèguān;乐趣=lèqù;乐队=yuèduì;乘坐=chéngzuò;乘客=chéngkè;乘车=chéng chē;
也好=yěhǎo;也许=yěxǔ;习惯=xíguàn;乡村=xiāngcūn;书包=shūbāo;书店=shūdiàn;书架=shūjià;书柜=shūguì;
书桌=shūzhuō;书法=shūfǎ;买卖=mǎimai;了不起=liǎobuqǐ;了解=liǎojiě;争取=zhēngqǔ;争议=zhēngyì;
争论=zhēnglùn;事业=shìyè;事件=shìjiàn;事先=shìxiān;事实=shìshí;事实上=shìshíshang;事情=shìqing;
事故=shìgù;事物=shìwù;二手=èrshǒu;二维码=èrwéimǎ;于是=yúshì;互相=hùxiāng;互联网=hùliánwǎng;
五颜六色=wǔyán-liùsè;亚军=yàjūn;亚运会=Yàyùnhuì;交代=jiāodài;交往=jiāowǎng;交换=jiāohuàn;交易=jiāoyì;
交朋友=jiāo péngyou;交流=jiāoliú;交给=jiāo gěi;交警=jiāojǐng;交费=jiāofèi;交通=jiāotōng;交际=jiāojì;
产业=chǎnyè;产品=chǎnpǐn;产生=chǎnshēng;享受=xiǎngshòu;京剧=jīngjù;亲人=qīnrén;亲切=qīnqiè;
亲密=qīnmì;亲爱=qīn'ài;亲自=qīnzì;人们=rénmen;人力=rénlì;人口=rénkǒu;人员=rényuán;人士=rénshì;
人家=rénjia;人工=réngōng;人才=réncái;人数=rénshù;人民=rénmín;人民币=rénmínbì;人物=rénwù;人生=rénshēng;
人类=rénlèi;人群=rénqún;人间=rénjiān;什么=shénme;什么样=shénmeyàng;仅仅=jǐnjǐn;今后=jīnhòu;
今天=jīntiān;今年=jīnnián;今日=jīnrì;介绍=jièshào;仍旧=réngjiù;仍然=réngrán;从中=cóngzhōng;
从事=cóngshì;从前=cóngqián;从小=cóngxiǎo;从来=cónglái;从此=cóngcǐ;从而=cóng'ér;仔细=zǐxì;他们=tāmen;
付出=fùchū;代价=dàijià;代替=dàitì;代理=dàilǐ;代表=dàibiǎo;代表团=dàibiǎotuán;以上=yǐshàng;以下=yǐxià;
以为=yǐwéi;以便=yǐbiàn;以内=yǐnèi;以前=yǐqián;以及=yǐjí;以后=yǐhòu;以外=yǐwài;以往=yǐwǎng;以来=yǐlái;
价值=jiàzhí;价格=jiàgé;价钱=jiàqian;任何=rènhé;任务=rènwu;企业=qǐyè;休假=xiūjià;休息=xiūxi;
休闲=xiūxián;众多=zhòngduō;优先=yōuxiān;优势=yōushì;优惠=yōuhuì;优点=yōudiǎn;优秀=yōuxiù;优美=yōuměi;
优良=yōuliáng;伙伴=huǒbàn;会员=huìyuán;会计=kuàijì;会议=huìyì;会谈=huìtán;伟大=wěidà;传播=chuánbō;
传来=chuánlái;传真=chuánzhēn;传统=chuántǒng;传说=chuánshuō;传达=chuándá;传递=chuándì;伤害=shānghài;
伤心=shāngxīn;估计=gūjì;似乎=sìhū;似的=shìde;但是=dànshì;位于=wèiyú;位置=wèizhi;低于=dīyú;住房=zhùfáng;
住院=zhùyuàn;体会=tǐhuì;体力=tǐlì;体操=tǐcāo;体检=tǐjiǎn;体现=tǐxiàn;体积=tǐjī;体育=tǐyù;
体育场=tǐyùchǎng;体育馆=tǐyùguǎn;体重=tǐzhòng;体验=tǐyàn;作业=zuòyè;作为=zuòwéi;作出=zuòchū;
作品=zuòpǐn;作家=zuòjiā;作文=zuòwén;作用=zuòyòng;作者=zuòzhě;你们=nǐmen;使劲=shǐjìn;使得=shǐde;
使用=shǐyòng;例外=lìwài;例如=lìrú;例子=lìzi;供应=gōngyìng;依据=yījù;依旧=yījiù;依法=yīfǎ;依然=yīrán;
依照=yīzhào;依靠=yīkào;便于=biànyú;便利=biànlì;便宜=piányi;便条=biàntiáo;促使=cùshǐ;促进=cùjìn;
促销=cùxiāo;保养=bǎoyǎng;保卫=bǎowèi;保存=bǎocún;保守=bǎoshǒu;保安=bǎo'ān;保密=bǎomì;保护=bǎohù;
保持=bǎochí;保留=bǎoliú;保证=bǎozhèng;保险=bǎoxiǎn;信任=xìnrèn;信号=xìnhào;信封=xìnfēng;信心=xìnxīn;
信念=xìnniàn;信息=xìnxī;信用卡=xìnyòngkǎ;信箱=xìnxiāng;修养=xiūyǎng;修复=xiūfù;修建=xiūjiàn;
修改=xiūgǎi;修理=xiūlǐ;俱乐部=jùlèbù;倒是=dàoshi;倒车=dǎochē;倒闭=dǎobì;倡导=chàngdǎo;值得=zhíde;
值班=zhíbān;假如=jiǎrú;假期=jiàqī;做到=zuòdào;做客=zuòkè;做梦=zuòmèng;做法=zuòfǎ;做饭=zuòfàn;
停下=tíngxia;停止=tíngzhǐ;停留=tíngliú;停车=tíngchē;停车场=tíngchēchǎng;健全=jiànquán;健康=jiànkāng;
健身=jiànshēn;偶像=ǒuxiàng;偶尔=ǒu'ěr;偶然=ǒurán;偷偷=tōutōu;儿女=érnǚ;儿子=érzi;儿童=értóng;
元旦=Yuándàn;兄弟=xiōngdì;充分=chōngfèn;充满=chōngmǎn;充电=chōngdiàn;充电器=chōngdiànqì;
充足=chōngzú;先前=xiānqián;先后=xiānhòu;先生=xiānsheng;先进=xiānjìn;光临=guānglín;光明=guāngmíng;
光盘=guāngpán;光线=guāngxiàn;光荣=guāngróng;克服=kèfú;免费=miǎnfèi;入口=rùkǒu;入门=rùmén;
全世界=quán shìjiè;全体=quántǐ;全国=quánguó;全场=quánchǎng;全家=quánjiā;全年=quánnián;全球=quánqiú;
全身=quánshēn;全部=quánbù;全都=quándōu;全面=quánmiàn;公交车=gōngjiāochē;公元=gōngyuán;公共=gōnggòng;
公共汽车=gōnggòng qìchē;公务员=gōngwùyuán;公司=gōngsī;公告=gōnggào;公园=gōngyuán;公布=gōngbù;
公平=gōngpíng;公开=gōngkāi;公式=gōngshì;公斤=gōngjīn;公正=gōngzhèng;公民=gōngmín;公认=gōngrèn;
公路=gōnglù;公里=gōnglǐ;共享=gòngxiǎng;共同=gòngtóng;共有=gòngyǒu;共计=gòngjì;关上=guānshang;
关于=guānyú;关心=guānxīn;关怀=guānhuái;关机=guānjī;关注=guānzhù;关系=guānxi;关键=guānjiàn;
关闭=guānbì;兴奋=xīngfèn;兴趣=xìngqù;其中=qízhōng;其他=qítā;其余=qíyú;其实=qíshí;其次=qícì;具体=jùtǐ;
具备=jùbèi;具有=jùyǒu;典型=diǎnxíng;典礼=diǎnlǐ;养成=yǎngchéng;内在=nèizài;内容=nèiróng;内心=nèixīn;
内科=nèikē;内部=nèibù;再三=zàisān;再也=zài yě;再次=zàicì;再见=zàijiàn;写作=xiězuò;军人=jūnrén;
农业=nóngyè;农产品=nóngchǎnpǐn;农村=nóngcūn;农民=nóngmín;冠军=guànjūn;冬天=dōngtiān;冬季=dōngjì;
冰箱=bīngxiāng;冰雪=bīngxuě;冲动=chōngdòng;冲突=chōngtū;决不=jué bù;决定=juédìng;决心=juéxīn;
决赛=juésài;冷静=lěngjìng;准备=zhǔnbèi;准时=zhǔnshí;准确=zhǔnquè;凉快=liángkuai;凉水=liángshuǐ;
减少=jiǎnshǎo;减肥=jiǎnféi;减轻=jiǎnqīng;几乎=jīhū;出于=chūyú;出去=chūqù;出发=chūfā;出口=chūkǒu;
出售=chūshòu;出国=chūguó;出差=chūchāi;出席=chūxí;出来=chūlái;出汗=chūhàn;出版=chūbǎn;出现=chūxiàn;
出生=chūshēng;出租=chūzū;出租车=chūzūchē;出色=chūsè;出门=chūmén;出院=chūyuàn;分为=fēnwéi;分之=fēn zhī;
分享=fēnxiǎng;分别=fēnbié;分布=fēnbù;分开=fēnkāi;分成=fēnchéng;分手=fēnshǒu;分散=fēnsàn;分数=fēnshù;
分析=fēnxī;分离=fēnlí;分类=fēnlèi;分组=fēn zǔ;分解=fēnjiě;分配=fēnpèi;分钟=fēnzhōng;划分=huàfēn;
划船=huáchuán;列为=lièwéi;列入=lièrù;列车=lièchē;刚刚=gānggang;刚才=gāngcái;创业=chuàngyè;
创作=chuàngzuò;创新=chuàngxīn;创立=chuànglì;创造=chuàngzào;初中=chūzhōng;初期=chūqī;初步=chūbù;
初级=chūjí;判断=pànduàn;利息=lìxī;利润=lìrùn;利用=lìyòng;利益=lìyì;别人=biéren;别的=biéde;到处=dàochù;
到底=dàodǐ;到来=dàolái;到达=dàodá;制作=zhìzuò;制定=zhìdìng;制度=zhìdù;制成=zhìchéng;制约=zhìyuē;
制订=zhìdìng;制造=zhìzào;刷子=shuāzi;刷牙=shuā yá;刺激=cìjī;前后=qiánhòu;前天=qiántiān;前头=qiántou;
前年=qiánnián;前往=qiánwǎng;前提=qiántí;前景=qiánjǐng;前边=qiánbian;前进=qiánjìn;前途=qiántú;
前面=qiánmiàn;剧场=jùchǎng;剧本=jùběn;剩下=shèngxia;剪刀=jiǎndāo;剪子=jiǎnzi;力气=lìqi;力量=lìliang;
办事=bànshì;办公室=bàngōngshì;办法=bànfǎ;办理=bànlǐ;功夫=gōngfu;功能=gōngnéng;功课=gōngkè;
加上=jiāshàng;加以=jiāyǐ;加入=jiārù;加工=jiāgōng;加强=jiāqiáng;加快=jiākuài;加油=jiāyóu;
加油站=jiāyóuzhàn;加热=jiārè;加班=jiābān;加速=jiāsù;动人=dòngrén;动作=dòngzuò;动力=dònglì;
动员=dòngyuán;动态=dòngtài;动手=dòngshǒu;动摇=dòngyáo;动机=dòngjī;动物=dòngwù;动物园=dòngwùyuán;
动画片=dònghuàpiàn;助手=zhùshǒu;助理=zhùlǐ;努力=nǔlì;劳动=láodòng;势力=shìli;勇敢=yǒnggǎn;勇气=yǒngqì;
勤奋=qínfèn;包含=bāohán;包围=bāowéi;包子=bāozi;包括=bāokuò;包装=bāozhuāng;包裹=bāoguǒ;化石=huàshí;
北京=Běijīng;北方=běifāng;北极=běijí;北边=běibian;北部=běibù;区别=qūbié;区域=qūyù;医学=yīxué;
医生=yīshēng;医疗=yīliáo;医院=yīyuàn;十分=shífēn;十足=shízú;千万=qiānwàn;千克=qiānkè;升高=shēnggāo;
午睡=wǔshuì;午餐=wǔcān;午饭=wǔfàn;半夜=bànyè;半天=bàntiān;半年=bàn nián;华人=huárén;华语=Huáyǔ;
协议=xiéyì;协议书=xiéyìshū;单一=dānyī;单位=dānwèi;单元=dānyuán;单独=dāndú;单纯=dānchún;单调=dāndiào;
南北=nánběi;南方=nánfāng;南极=nánjí;南边=nánbian;南部=nánbù;博士=bóshì;博客=bókè;博物馆=bówùguǎn;
博览会=bólǎnhuì;占有=zhànyǒu;占领=zhànlǐng;卧室=wòshì;卫星=wèixīng;卫生=wèishēng;卫生间=wèishēngjiān;
印刷=yìnshuā;印象=yìnxiàng;危害=wēihài;危险=wēixiǎn;即使=jíshǐ;即将=jíjiāng;厂长=chǎngzhǎng;
历史=lìshǐ;厉害=lìhai;压力=yālì;厘米=límǐ;原先=yuánxiān;原则=yuánzé;原因=yuányīn;原始=yuánshǐ;
原料=yuánliào;原有=yuányǒu;原来=yuánlái;原理=yuánlǐ;厨房=chúfáng;去世=qùshì;去年=qùnián;参与=cānyù;
参加=cānjiā;参考=cānkǎo;参观=cānguān;叉子=chāzi;及时=jíshí;及格=jígé;友好=yǒuhǎo;友谊=yǒuyì;
双手=shuāng shǒu;双方=shuāngfāng;反复=fǎnfù;反对=fǎnduì;反应=fǎnyìng;反映=fǎnyìng;反正=fǎnzhèng;
反而=fǎn'ér;发出=fāchū;发动=fādòng;发射=fāshè;发展=fāzhǎn;发布=fābù;发挥=fāhuī;发明=fāmíng;发烧=fāshāo;
发现=fāxiàn;发生=fāshēng;发票=fāpiào;发行=fāxíng;发表=fābiǎo;发觉=fājué;发言=fāyán;发达=fādá;
发送=fāsòng;叔叔=shūshu;取得=qǔdé;取消=qǔxiāo;受不了=shòubuliǎo;受伤=shòushāng;受到=shòudào;
受灾=shòuzāi;变为=biànwéi;变动=biàndòng;变化=biànhuà;变成=biànchéng;口号=kǒuhào;口袋=kǒudai;
口语=kǒuyǔ;古代=gǔdài;古老=gǔlǎo;句子=jùzi;另一方面=lìng yìfāngmiàn;另外=lìngwài;只不过=zhǐbuguò;
只好=zhǐhǎo;只是=zhǐshì;只有=zhǐyǒu;只能=zhǐ néng;只要=zhǐyào;只见=zhǐ jiàn;叫作=jiàozuò;
召开=zhàokāi;可乐=kělè;可以=kěyǐ;可怕=kěpà;可怜=kělián;可惜=kěxī;可是=kěshì;可爱=kě'ài;可能=kěnéng;
可见=kějiàn;可靠=kěkào;台上=táishàng;台阶=táijiē;台风=táifēng;右边=yòubian;叶子=yèzi;号召=hàozhào;
号码=hàomǎ;司机=sījī;吃力=chīlì;吃惊=chījīng;吃饭=chīfàn;各个=gègè;各位=gèwèi;各地=gèdì;各种=gèzhǒng;
各自=gèzì;合作=hézuò;合同=hétong;合并=hébìng;合成=héchéng;合格=hégé;合法=héfǎ;合理=hélǐ;合适=héshì;
同事=tóngshì;同学=tóngxué;同情=tóngqíng;同意=tóngyì;同时=tóngshí;同样=tóngyàng;名人=míngrén;
名单=míngdān;名字=míngzi;名片=míngpiàn;名牌儿=míngpáir;名称=míngchēng;后天=hòutiān;后头=hòutou;
后年=hòunián;后悔=hòuhuǐ;后来=hòulái;后果=hòuguǒ;后边=hòubian;后面=hòumian;向上=xiàngshàng;
向前=xiàng qián;向导=xiàngdǎo;否则=fǒuzé;否定=fǒudìng;否认=fǒurèn;含义=hányì;含有=hányǒu;
含量=hánliàng;听众=tīngzhòng;听写=tīngxiě;听到=tīngdào;听力=tīnglì;听见=tīngjiàn;听讲=tīngjiǎng;
听说=tīngshuō;启事=qǐshì;启动=qǐdòng;启发=qǐfā;吵架=chǎojià;吸引=xīyǐn;吸收=xīshōu;吸烟=xīyān;
吸管=xīguǎn;告别=gàobié;告诉=gàosu;员工=yuángōng;周围=zhōuwéi;周年=zhōunián;周期=zhōuqī;周末=zhōumò;
味儿=wèir;味道=wèidao;呼吸=hūxī;命令=mìnglìng;命运=mìngyùn;和平=hépíng;咖啡=kāfēi;咱们=zánmen;
品种=pǐnzhǒng;品质=pǐnzhì;哈哈=hāhā;哥哥=gēge;哪些=nǎxiē;哪儿=nǎr;哪怕=nǎpà;哪里=nǎlǐ;
售货员=shòuhuòyuán;唯一=wéiyī;唱歌=chànggē;唱片=chàngpiàn;商业=shāngyè;商人=shāngrén;商务=shāngwù;
商品=shāngpǐn;商场=shāngchǎng;商店=shāngdiàn;商标=shāngbiāo;商量=shāngliang;啤酒=píjiǔ;善于=shànyú;
善良=shànliáng;喜剧=xǐjù;喜欢=xǐhuan;喜爱=xǐ'ài;嘴巴=zuǐba;器官=qìguān;四周=sìzhōu;回信=huíxìn;
回到=huídào;回去=huíqu;回国=huí guó;回复=huífù;回头=huítóu;回家=huí jiā;回忆=huíyì;回报=huíbào;
回收=huíshōu;回来=huílai;回答=huídá;回避=huíbì;回顾=huígù;因为=yīnwèi;因此=yīncǐ;因而=yīn'ér;
团体=tuántǐ;团结=tuánjié;团长=tuánzhǎng;园林=yuánlín;困扰=kùnrǎo;困难=kùnnan;围巾=wéijīn;围绕=wéirào;
固定=gùdìng;国内=guó nèi;国外=guó wài;国家=guójiā;国庆=guóqìng;国民=guómín;国籍=guójí;国际=guójì;
图书馆=túshūguǎn;图案=tú'àn;图片=túpiàn;图画=túhuà;圆满=yuánmǎn;土地=tǔdì;土豆=tǔdòu;在乎=zàihu;
在于=zàiyú;在内=zàinèi;在场=zàichǎng;在家=zàijiā;地上=dìshang;地下=dìxià;地位=dìwèi;地区=dìqū;
地图=dìtú;地址=dìzhǐ;地带=dìdài;地形=dìxíng;地方=dìfang;地点=dìdiǎn;地球=dìqiú;地铁=dìtiě;
地铁站=dìtiězhàn;地震=dìzhèn;地面=dìmiàn;场合=chǎnghé;场所=chǎngsuǒ;场面=chǎngmiàn;坏人=huàirén;
坏处=huàichu;坐下=zuò xia;坚决=jiānjué;坚固=jiāngù;坚定=jiāndìng;坚强=jiānqiáng;坚持=jiānchí;
垃圾=lājī;型号=xínghào;城市=chéngshì;城里=chénglǐ;培养=péiyǎng;培育=péiyù;培训=péixùn;
培训班=péixùnbān;基地=jīdì;基本=jīběn;基本上=jīběnshang;基础=jīchǔ;基金=jījīn;堵车=dǔchē;塑料=sùliào;
塑料袋=sùliàodài;填空=tiánkòng;墙壁=qiángbì;增产=zēngchǎn;增加=zēngjiā;增多=zēngduō;增大=zēngdà;
增强=zēngqiáng;增长=zēngzhǎng;士兵=shìbīng;声明=shēngmíng;声音=shēngyīn;处于=chǔyú;处分=chǔfèn;
处在=chǔzài;处理=chǔlǐ;处罚=chǔfá;复习=fùxí;复制=fùzhì;复印=fùyìn;复杂=fùzá;夏天=xiàtiān;夏季=xiàjì;
外交=wàijiāo;外交官=wàijiāoguān;外卖=wàimài;外国=wàiguó;外地=wàidì;外套=wàitào;外文=wàiwén;
外汇=wàihuì;外界=wàijiè;外语=wàiyǔ;外边=wàibian;外面=wàimiàn;多久=duōjiǔ;多么=duōme;多云=duōyún;
多少=duōshao;多年=duō nián;多数=duōshù;多样=duōyàng;多次=duō cì;多种=duō zhǒng;夜里=yèli;夜间=yèjiān;
大事=dàshì;大于=dàyú;大人=dàren;大众=dàzhòng;大伙儿=dàhuǒr;大会=dàhuì;大使馆=dàshǐguǎn;大厅=dàtīng;
大哥=dàgē;大型=dàxíng;大声=dà shēng;大多=dàduō;大多数=dàduōshù;大大=dàdà;大夫=dàifu;大奖赛=dàjiǎngsài;
大妈=dàmā;大姐=dàjiě;大学=dàxué;大学生=dàxuéshēng;大家=dàjiā;大小=dàxiǎo;大巴=dàbā;大方=dàfang;
大楼=dà lóu;大概=dàgài;大海=dàhǎi;大熊猫=dàxióngmāo;大爷=dàye;大约=dàyuē;大纲=dàgāng;大胆=dàdǎn;
大脑=dànǎo;大自然=dàzìrán;大致=dàzhì;大衣=dàyī;大规模=dà guīmó;大象=dàxiàng;大部分=dàbùfen;大都=dàdū;
大量=dàliàng;大门=dàmén;大陆=dàlù;天上=tiānshàng;天才=tiāncái;天文=tiānwén;天气=tiānqì;
天然气=tiānránqì;天真=tiānzhēn;天空=tiānkōng;太太=tàitai;太空=tàikōng;太阳=tàiyang;夫人=fūren;
夫妇=fūfù;夫妻=fūqī;失业=shīyè;失去=shīqù;失望=shīwàng;失误=shīwù;失败=shībài;头发=tóufa;头脑=tóunǎo;
奇怪=qíguài;奋斗=fèndòu;奖励=jiǎnglì;奖学金=jiǎngxuéjīn;奖金=jiǎngjīn;套餐=tàocān;女人=nǚrén;
女儿=nǚ'ér;女士=nǚshì;女子=nǚzǐ;女孩儿=nǚháir;女性=nǚxìng;女朋友=nǚpéngyou;女生=nǚshēng;奶奶=nǎinai;
奶茶=nǎichá;她们=tāmen;好久=hǎojiǔ;好事=hǎoshì;好人=hǎorén;好像=hǎoxiàng;好友=hǎoyǒu;好吃=hǎochī;
好听=hǎotīng;好处=hǎochu;好多=hǎoduō;好奇=hàoqí;好好=hǎohǎo;好玩儿=hǎowánr;好看=hǎokàn;好运=hǎoyùn;
如下=rúxià;如今=rújīn;如何=rúhé;如同=rútóng;如果=rúguǒ;如此=rúcǐ;妈妈=māma;妹妹=mèimei;妻子=qīzi;
始终=shǐzhōng;姐妹=jiěmèi;姐姐=jiějie;姑娘=gūniang;姓名=xìngmíng;委托=wěituō;婚礼=hūnlǐ;媒体=méitǐ;
子女=zǐnǚ;子弹=zǐdàn;字典=zìdiǎn;字母=zìmǔ;存在=cúnzài;存款=cúnkuǎn;孙女=sūnnǚ;孙子=sūnzi;季度=jìdù;
季节=jìjié;学习=xuéxí;学位=xuéwèi;学分=xuéfēn;学年=xuénián;学时=xuéshí;学期=xuéqī;学术=xuéshù;
学校=xuéxiào;学生=xuésheng;学科=xuékē;学者=xuézhě;学费=xuéfèi;学问=xuéwen;学院=xuéyuàn;孩子=háizi;
宁静=níngjìng;它们=tāmen;安全=ānquán;安慰=ānwèi;安排=ānpái;安置=ānzhì;安装=ānzhuāng;安静=ānjìng;
完了=wánle;完全=wánquán;完善=wánshàn;完成=wánchéng;完整=wánzhěng;完美=wánměi;官方=guānfāng;
定期=dìngqī;宝宝=bǎobao;宝石=bǎoshí;宝贝=bǎobèi;宝贵=bǎoguì;实习=shíxí;实力=shílì;实在=shízài;
实惠=shíhuì;实施=shíshī;实现=shíxiàn;实用=shíyòng;实行=shíxíng;实际=shíjì;实际上=shíjìshàng;
实验=shíyàn;实验室=shíyànshì;客人=kèrén;客厅=kètīng;客户=kèhù;客气=kèqi;客观=kèguān;宣传=xuānchuán;
宣布=xuānbù;害怕=hàipà;家乡=jiāxiāng;家人=jiārén;家具=jiājù;家务=jiāwù;家属=jiāshǔ;家庭=jiātíng;
家里=jiā li;家长=jiāzhǎng;容易=róngyì;宽广=kuānguǎng;宽度=kuāndù;宾馆=bīnguǎn;宿舍=sùshè;密切=mìqiè;
密码=mìmǎ;寒假=hánjià;寒冷=hánlěng;对不起=duìbuqǐ;对于=duìyú;对付=duìfu;对应=duìyìng;对待=duìdài;
对手=duìshǒu;对方=duìfāng;对比=duìbǐ;对立=duìlì;对话=duìhuà;对象=duìxiàng;对面=duìmiàn;寻找=xúnzhǎo;
寻求=xúnqiú;导游=dǎoyóu;导演=dǎoyǎn;导致=dǎozhì;寿司=shòusī;封闭=fēngbì;射击=shèjī;将来=jiānglái;
将要=jiāngyào;将近=jiāngjìn;尊敬=zūnjìng;尊重=zūnzhòng;小伙子=xiǎohuǒzi;小偷儿=xiǎotōur;小吃=xiǎochī;
小型=xiǎoxíng;小声=xiǎo shēng;小姐=xiǎojie;小学=xiǎoxué;小学生=xiǎoxuéshēng;小孩儿=xiǎoháir;
小心=xiǎoxīn;小时=xiǎoshí;小时候=xiǎoshíhou;小朋友=xiǎopéngyǒu;小组=xiǎozǔ;小说=xiǎoshuō;
少年=shàonián;少数=shǎoshù;尝试=chángshì;尤其=yóuqí;就业=jiùyè;就是=jiùshì;就要=jiùyào;尺子=chǐzi;
尺寸=chǐcun;尽力=jìnlì;尽可能=jìn kěnéng;尽快=jǐnkuài;尽管=jǐnguǎn;尽量=jǐnliàng;尾巴=wěiba;
局长=júzhǎng;局面=júmiàn;层次=céngcì;居住=jūzhù;居民=jūmín;居然=jūrán;屋子=wūzi;展开=zhǎnkāi;
展现=zhǎnxiàn;展示=zhǎnshì;展览=zhǎnlǎn;属于=shǔyú;山区=shānqū;岁月=suìyuè;岸上=àn shang;工业=gōngyè;
工人=gōngrén;工作=gōngzuò;工作日=gōngzuòrì;工具=gōngjù;工厂=gōngchǎng;工夫=gōngfu;工程=gōngchéng;
工程师=gōngchéngshī;工艺=gōngyì;工资=gōngzī;左右=zuǒyòu;左边=zuǒbian;巧克力=qiǎokèlì;巨大=jùdà;
差不多=chàbuduō;差别=chābié;差点儿=chàdiǎnr;差距=chājù;已经=yǐjīng;巴士=bāshì;市区=shìqū;市场=shìchǎng;
市长=shìzhǎng;布置=bùzhì;帅哥=shuàigē;师傅=shīfu;希望=xīwàng;带动=dàidòng;带有=dàiyǒu;带来=dàilái;
带领=dàilǐng;帮助=bāngzhù;帮忙=bāngmáng;常常=chángcháng;常用=cháng yòng;常见=cháng jiàn;
常识=chángshí;帽子=màozi;幅度=fúdù;干什么=gàn shénme;干净=gānjìng;干吗=gànmá;干扰=gānrǎo;干杯=gānbēi;
干活儿=gànhuór;干脆=gāncuì;干预=gānyù;平原=píngyuán;平均=píngjūn;平坦=píngtǎn;平安=píng'ān;
平常=píngcháng;平方=píngfāng;平时=píngshí;平稳=píngwěn;平等=píngděng;平静=píngjìng;年代=niándài;
年初=niánchū;年前=niánqián;年底=niándǐ;年度=niándù;年级=niánjí;年纪=niánjì;年轻=niánqīng;
年龄=niánlíng;并且=bìngqiě;幸福=xìngfú;幸运=xìngyùn;幼儿园=yòu'éryuán;幽默=yōumò;广告=guǎnggào;
广场=guǎngchǎng;广大=guǎngdà;广播=guǎngbō;广泛=guǎngfàn;庆祝=qìngzhù;应当=yīngdāng;应用=yìngyòng;
应该=yīnggāi;底下=dǐxia;度过=dùguò;座位=zuòwèi;延伸=yánshēn;延期=yánqī;延续=yánxù;延长=yáncháng;
建成=jiànchéng;建立=jiànlì;建筑=jiànzhù;建议=jiànyì;建设=jiànshè;建造=jiànzào;开业=kāiyè;开会=kāihuì;
开发=kāifā;开始=kāishǐ;开学=kāixué;开展=kāizhǎn;开幕=kāimù;开幕式=kāimùshì;开心=kāixīn;开放=kāifàng;
开机=kāijī;开水=kāishuǐ;开玩笑=kāi wánxiào;开花=kāihuā;开车=kāichē;引导=yǐndǎo;引起=yǐnqǐ;引进=yǐnjìn;
弟弟=dìdi;强大=qiángdà;强度=qiángdù;强烈=qiángliè;强调=qiángdiào;强迫=qiǎngpò;当中=dāngzhōng;
当代=dāngdài;当初=dāngchū;当前=dāngqián;当地=dāngdì;当场=dāngchǎng;当年=dāngnián;当时=dāngshí;
当然=dāngrán;当选=dāngxuǎn;录取=lùqǔ;录音=lùyīn;形势=xíngshì;形容=xíngróng;形式=xíngshì;形态=xíngtài;
形成=xíngchéng;形状=xíngzhuàng;形象=xíngxiàng;彩票=cǎipiào;彩色=cǎisè;影响=yǐngxiǎng;影子=yǐngzi;
影片=yǐngpiàn;影视=yǐngshì;彻底=chèdǐ;彼此=bǐcǐ;往往=wǎngwǎng;征服=zhēngfú;征求=zhēngqiú;待遇=dàiyù;
律师=lǜshī;得了=déle;得以=déyǐ;得出=déchū;得分=défēn;得到=dédào;得意=déyì;微信=wēixìn;微博=wēibó;
微笑=wēixiào;心中=xīnzhōng;心态=xīntài;心情=xīnqíng;心理=xīnlǐ;心疼=xīnténg;心里=xīnli;必然=bìrán;
必要=bìyào;必需=bìxū;必须=bìxū;忍不住=rěn bu zhù;忍受=rěnshòu;志愿=zhìyuàn;志愿者=zhìyuànzhě;
忘记=wàngjì;快乐=kuàilè;快活=kuàihuo;快点儿=kuài diǎnr;快要=kuàiyào;快递=kuàidì;快速=kuàisù;
快餐=kuàicān;忽然=hūrán;忽视=hūshì;怀念=huáiniàn;怀疑=huáiyí;态度=tàidu;怎么=zěnme;怎么办=zěnme bàn;
怎么样=zěnmeyàng;怎样=zěnyàng;思想=sīxiǎng;思维=sīwéi;思考=sīkǎo;急忙=jímáng;性别=xìngbié;性格=xìnggé;
性能=xìngnéng;性质=xìngzhì;总之=zǒngzhī;总体=zǒngtǐ;总共=zǒnggòng;总数=zǒngshù;总是=zǒngshì;
总理=zǒnglǐ;总算=zǒngsuàn;总结=zǒngjié;总统=zǒngtǒng;总裁=zǒngcái;恋爱=liàn'ài;恐怕=kǒngpà;
恢复=huīfù;恶心=ěxin;悄悄=qiāoqiāo;悲伤=bēishāng;悲剧=bēijù;情况=qíngkuàng;情形=qíngxing;
情感=qínggǎn;情景=qíngjǐng;情节=qíngjié;想到=xiǎngdào;想念=xiǎngniàn;想法=xiǎngfǎ;想象=xiǎngxiàng;
想起=xiǎngqǐ;意义=yìyì;意味着=yìwèizhe;意外=yìwài;意志=yìzhì;意思=yìsi;意见=yìjiàn;意识=yìshí;
感兴趣=gǎn xìngqù;感冒=gǎnmào;感到=gǎndào;感动=gǎndòng;感受=gǎnshòu;感情=gǎnqíng;感想=gǎnxiǎng;
感觉=gǎnjué;感谢=gǎnxiè;愿意=yuànyì;愿望=yuànwàng;慌忙=huāngmáng;慢慢=mànmàn;慰问=wèiwèn;懂得=dǒngde;
戏剧=xìjù;成为=chéngwéi;成交=chéngjiāo;成人=chéngrén;成功=chénggōng;成员=chéngyuán;成就=chéngjiù;
成效=chéngxiào;成本=chéngběn;成果=chéngguǒ;成熟=chéngshú;成立=chénglì;成绩=chéngjì;成语=chéngyǔ;
成长=chéngzhǎng;我们=wǒmen;或是=huòshì;或者=huòzhě;或许=huòxǔ;战争=zhànzhēng;战士=zhànshì;
战斗=zhàndòu;战胜=zhànshèng;房东=fángdōng;房子=fángzi;房屋=fángwū;房租=fángzū;房间=fángjiān;
所以=suǒyǐ;所在=suǒzài;所有=suǒyǒu;所长=suǒzhǎng;扇子=shànzi;手套=shǒutào;手工=shǒugōng;手指=shǒuzhǐ;
手术=shǒushù;手机=shǒujī;手段=shǒuduàn;手法=shǒufǎ;手续=shǒuxù;手表=shǒubiǎo;手里=shǒu li;
才能=cáinéng;打击=dǎjī;打包=dǎbāo;打印=dǎyìn;打听=dǎting;打工=dǎgōng;打开=dǎkāi;打扫=dǎsǎo;打扮=dǎban;
打扰=dǎrǎo;打折=dǎzhé;打架=dǎjià;打球=dǎ qiú;打电话=dǎ diànhuà;打破=dǎpò;打算=dǎsuàn;打败=dǎbài;
打车=dǎchē;打针=dǎzhēn;打雷=dǎléi;执行=zhíxíng;扩大=kuòdà;扩展=kuòzhǎn;扮演=bànyǎn;批准=pīzhǔn;
批评=pīpíng;找出=zhǎochū;找到=zhǎodào;承办=chéngbàn;承受=chéngshòu;承担=chéngdān;承认=chéngrèn;
技巧=jìqiǎo;技术=jìshù;技能=jìnéng;抄写=chāoxiě;把握=bǎwò;抓住=zhuāzhù;抓紧=zhuājǐn;投入=tóurù;
投诉=tóusù;投资=tóuzī;抢救=qiǎngjiù;护士=hùshi;护照=hùzhào;报到=bàodào;报名=bàomíng;报告=bàogào;
报答=bàodá;报纸=bàozhǐ;报警=bàojǐng;报道=bàodào;抬头=táitóu;抱怨=bàoyuàn;押金=yājīn;抽奖=chōujiǎng;
抽烟=chōuyān;担任=dānrèn;担保=dānbǎo;担心=dānxīn;拆除=chāichú;拉开=lākāi;拍摄=pāishè;拍照=pāizhào;
拒绝=jùjué;招呼=zhāohu;招手=zhāoshǒu;招生=zhāoshēng;拜访=bàifǎng;拥抱=yōngbào;拥有=yōngyǒu;
括号=kuòhào;拿出=náchū;拿到=nádào;持续=chíxù;指出=zhǐchū;指导=zhǐdǎo;指挥=zhǐhuī;指标=zhǐbiāo;
指甲=zhǐjia;指示=zhǐshì;指责=zhǐzé;按摩=ànmó;按时=ànshí;按照=ànzhào;挑战=tiǎozhàn;挑选=tiāoxuǎn;
挣钱=zhèngqián;振动=zhèndòng;挺好=tǐng hǎo;损失=sǔnshī;损害=sǔnhài;据说=jùshuō;掌握=zhǎngwò;
排列=páiliè;排名=páimíng;排球=páiqiú;排队=páiduì;排除=páichú;接下来=jiē xiàlái;接到=jiēdào;
接受=jiēshòu;接待=jiēdài;接着=jiēzhe;接触=jiēchù;接近=jiējìn;接连=jiēlián;控制=kòngzhì;推动=tuīdòng;
推广=tuīguǎng;推开=tuīkāi;推行=tuīxíng;推进=tuījìn;推迟=tuīchí;推销=tuīxiāo;措施=cuòshī;描写=miáoxiě;
描述=miáoshù;提供=tígōng;提倡=tíchàng;提出=tíchū;提到=tídào;提前=tíqián;提示=tíshì;提起=tíqǐ;
提醒=tíxǐng;提问=tíwèn;提高=tígāo;握手=wòshǒu;搜索=sōusuǒ;搞好=gǎohǎo;搬家=bānjiā;摄像=shèxiàng;
摄像机=shèxiàngjī;摄影=shèyǐng;摄影师=shèyǐngshī;摆动=bǎidòng;摆脱=bǎituō;摇头=yáotóu;摔倒=shuāidǎo;
摩托=mótuō;摩擦=mócā;播出=bōchū;播放=bōfàng;操作=cāozuò;操场=cāochǎng;支付=zhīfù;支出=zhīchū;
支持=zhīchí;支配=zhīpèi;收入=shōurù;收到=shōudào;收听=shōutīng;收回=shōuhuí;收拾=shōushi;收益=shōuyì;
收看=shōukàn;收获=shōuhuò;收购=shōugòu;收费=shōufèi;收集=shōují;收音机=shōuyīnjī;改变=gǎibiàn;
改善=gǎishàn;改正=gǎizhèng;改进=gǎijìn;改造=gǎizào;改革=gǎigé;放下=fàngxia;放假=fàngjià;放到=fàngdào;
放大=fàngdà;放学=fàngxué;放弃=fàngqì;放心=fàngxīn;放松=fàngsōng;政府=zhèngfǔ;政治=zhèngzhì;
故乡=gùxiāng;故事=gùshi;故意=gùyì;效果=xiàoguǒ;效率=xiàolǜ;敌人=dírén;敏感=mǐngǎn;救灾=jiùzāi;
教学=jiàoxué;教学楼=jiàoxuélóu;教室=jiàoshì;教师=jiàoshī;教授=jiàoshòu;教材=jiàocái;教练=jiàoliàn;
教育=jiàoyù;教训=jiàoxun;散文=sǎnwén;散步=sànbù;数字=shùzì;数据=shùjù;数目=shùmù;数码=shùmǎ;
数量=shùliàng;敲门=qiāo mén;整个=zhěnggè;整体=zhěngtǐ;整天=zhěngtiān;整整=zhěngzhěng;整理=zhěnglǐ;
整齐=zhěngqí;文件=wénjiàn;文化=wénhuà;文字=wénzì;文学=wénxué;文明=wénmíng;文章=wénzhāng;文艺=wényì;
新型=xīnxíng;新娘=xīnniáng;新年=xīnnián;新郎=xīnláng;新闻=xīnwén;新鲜=xīnxiān;方便=fāngbiàn;
方便面=fāngbiànmiàn;方向=fāngxiàng;方式=fāngshì;方案=fāng'àn;方法=fāngfǎ;方针=fāngzhēn;
方面=fāngmiàn;旁边=pángbiān;旅客=lǚkè;旅游=lǚyóu;旅行=lǚxíng;旅行社=lǚxíngshè;旅馆=lǚguǎn;无奈=wúnài;
无所谓=wúsuǒwèi;无数=wúshù;无法=wúfǎ;无疑=wúyí;无聊=wúliáo;无论=wúlùn;无限=wúxiàn;既然=jìrán;日历=rìlì;
日子=rìzi;日常=rìcháng;日报=rìbào;日期=rìqī;日记=rìjì;早上=zǎoshang;早就=zǎo jiù;早已=zǎoyǐ;
早晨=zǎochen;早期=zǎoqī;早餐=zǎocān;早饭=zǎofàn;时事=shíshì;时代=shídài;时候=shíhou;时光=shíguāng;
时刻=shíkè;时常=shícháng;时机=shíjī;时间=shíjiān;明亮=míngliàng;明天=míngtiān;明年=míngnián;
明明=míngmíng;明星=míngxīng;明显=míngxiǎn;明白=míngbai;明确=míngquè;星星=xīngxing;星期=xīngqī;
星期天=xīngqītiān;星期日=xīngqīrì;春天=chūntiān;春季=chūnjì;春节=Chūnjié;昨天=zuótiān;
是不是=shì bu shì;是否=shìfǒu;显得=xiǎnde;显然=xiǎnrán;显示=xiǎnshì;显著=xiǎnzhù;晚上=wǎnshang;
晚会=wǎnhuì;晚安=wǎn'ān;晚报=wǎnbào;晚点=wǎndiǎn;晚餐=wǎncān;晚饭=wǎnfàn;普及=pǔjí;普通=pǔtōng;
普通话=pǔtōnghuà;普遍=pǔbiàn;景色=jǐngsè;景象=jǐngxiàng;晴天=qíngtiān;晴朗=qínglǎng;智力=zhìlì;
智能=zhìnéng;暂停=zàntíng;暂时=zànshí;暑假=shǔjià;暖和=nuǎnhuo;暖气=nuǎnqì;暗示=ànshì;更加=gèngjiā;
更换=gēnghuàn;更新=gēngxīn;曾经=céngjīng;替代=tìdài;最初=zuìchū;最后=zuìhòu;最好=zuìhǎo;最近=zuìjìn;
月亮=yuèliang;月份=yuèfèn;月底=yuèdǐ;月球=yuèqiú;月饼=yuèbing;有些=yǒuxiē;有人=yǒu rén;有利=yǒulì;
有利于=yǒulì yú;有力=yǒulì;有劲儿=yǒujìnr;有名=yǒumíng;有害=yǒu hài;有意思=yǒu yìsi;有效=yǒuxiào;
有时候=yǒushíhou;有毒=yǒu dú;有点儿=yǒudiǎnr;有用=yǒuyòng;有的=yǒude;有的是=yǒudeshì;有着=yǒuzhe;
有空儿=yǒukòngr;有趣=yǒuqù;有限=yǒuxiàn;朋友=péngyou;服从=fúcóng;服务=fúwù;服装=fúzhuāng;朗读=lǎngdú;
期中=qīzhōng;期待=qīdài;期望=qīwàng;期末=qīmò;期间=qījiān;期限=qīxiàn;木头=mùtou;未必=wèibì;
未来=wèilái;本事=běnshi;本人=běnrén;本子=běnzi;本来=běnlái;本科=běnkē;本领=běnlǐng;机会=jīhuì;
机制=jīzhì;机器=jīqì;机器人=jīqìrén;机场=jīchǎng;机构=jīgòu;机票=jīpiào;机遇=jīyù;杀毒=shādú;杂志=zázhì;
权利=quánlì;材料=cáiliào;条件=tiáojiàn;来不及=láibují;来信=láixìn;来到=láidào;来得及=láidejí;
来源=láiyuán;来自=láizì;杯子=bēizi;松树=sōngshù;极了=jí le;极其=jíqí;构成=gòuchéng;构造=gòuzào;
果实=guǒshí;果汁=guǒzhī;果然=guǒrán;柜子=guìzi;查询=cháxún;标准=biāozhǔn;标志=biāozhì;标题=biāotí;
树叶=shùyè;树林=shùlín;校园=xiàoyuán;校长=xiàozhǎng;样子=yàngzi;根据=gēnjù;根本=gēnběn;格外=géwài;
桃树=táoshù;桃花=táohuā;桌子=zhuōzi;梦想=mèngxiǎng;梦见=mèngjiàn;检查=jiǎnchá;检测=jiǎncè;
检验=jiǎnyàn;森林=sēnlín;椅子=yǐzi;植物=zhíwù;楼上=lóu shàng;楼下=lóu xià;楼梯=lóutī;概念=gàiniàn;
概括=gàikuò;模仿=mófǎng;模型=móxíng;模式=móshì;模样=múyàng;模特儿=mótèr;模糊=móhu;模范=mófàn;
欢乐=huānlè;欢迎=huānyíng;欣赏=xīnshǎng;歌声=gēshēng;歌手=gēshǒu;歌曲=gēqǔ;歌迷=gēmí;正义=zhèngyì;
正在=zhèngzài;正好=zhènghǎo;正如=zhèngrú;正常=zhèngcháng;正式=zhèngshì;正是=zhèngshì;正版=zhèngbǎn;
正确=zhèngquè;正规=zhèngguī;此刻=cǐkè;此后=cǐhòu;此外=cǐwài;此时=cǐshí;步行=bùxíng;武器=wǔqì;
武术=wǔshù;母亲=mǔqīn;比例=bǐlì;比分=bǐfēn;比如=bǐrú;比如说=bǐrú shuō;比方=bǐfang;比赛=bǐsài;
比较=bǐjiào;比重=bǐzhòng;毕业=bìyè;毕业生=bìyèshēng;毕竟=bìjìng;毛巾=máojīn;毛病=máobìng;毛笔=máobǐ;
毛衣=máoyī;毫升=háoshēng;毫米=háomǐ;民族=mínzú;民间=mínjiān;气体=qìtǐ;气候=qìhòu;气温=qìwēn;气球=qìqiú;
气象=qìxiàng;水产品=shuǐchǎnpǐn;水分=shuǐfèn;水平=shuǐpíng;水库=shuǐkù;水果=shuǐguǒ;水灾=shuǐzāi;
永远=yǒngyuǎn;汇报=huìbào;汇款=huìkuǎn;汇率=huìlǜ;汉字=Hànzì;汉语=Hànyǔ;池子=chízi;污染=wūrǎn;
污水=wūshuǐ;汽水=qìshuǐ;汽油=qìyóu;汽车=qìchē;沉重=chénzhòng;沉默=chénmò;沙发=shāfā;沙子=shāzi;
沙漠=shāmò;沟通=gōutōng;没事儿=méishìr;没什么=méi shénme;没关系=méi guānxi;没想到=méi xiǎngdào;
没有=méiyǒu;没法儿=méifǎr;没用=méiyòng;没错=méi cuò;治安=zhì'ān;治理=zhìlǐ;治疗=zhìliáo;法制=fǎzhì;
法官=fǎguān;法律=fǎlǜ;法规=fǎguī;法院=fǎyuàn;注册=zhùcè;注射=zhùshè;注意=zhùyì;注视=zhùshì;
注重=zhùzhòng;泪水=lèishuǐ;洗手间=xǐshǒujiān;洗澡=xǐzǎo;洗衣机=xǐyījī;活力=huólì;活动=huódòng;
活泼=huópo;流传=liúchuán;流利=liúlì;流动=liúdòng;流行=liúxíng;流通=liútōng;测试=cèshì;测量=cèliáng;
浪漫=làngmàn;浪费=làngfèi;海关=hǎiguān;海水=hǎishuǐ;海边=hǎi biān;海鲜=hǎixiān;消化=xiāohuà;
消失=xiāoshī;消息=xiāoxi;消极=xiāojí;消毒=xiāodú;消费=xiāofèi;消费者=xiāofèizhě;消防=xiāofáng;
消除=xiāochú;涨价=zhǎngjià;深入=shēnrù;深刻=shēnkè;深厚=shēnhòu;深处=shēnchù;深度=shēndù;
清晨=qīngchén;清楚=qīngchu;清理=qīnglǐ;清醒=qīngxǐng;渐渐=jiànjiàn;温和=wēnhé;温度=wēndù;
温暖=wēnnuǎn;渴望=kěwàng;游客=yóukè;游戏=yóuxì;游泳=yóuyǒng;游泳池=yóuyǒngchí;满意=mǎnyì;满足=mǎnzú;
漂亮=piàoliang;漏洞=lòudòng;演出=yǎnchū;演员=yǎnyuán;演唱=yǎnchàng;演唱会=yǎnchànghuì;演讲=yǎnjiǎng;
漫画=mànhuà;漫长=màncháng;潮流=cháoliú;潮湿=cháoshī;激动=jīdòng;激烈=jīliè;火柴=huǒchái;火灾=huǒzāi;
火腿=huǒtuǐ;火车=huǒchē;灯光=dēngguāng;灰色=huīsè;灾区=zāiqū;灾害=zāihài;灾难=zāinàn;点名=diǎnmíng;
点头=diǎntóu;点燃=diǎnrán;烤肉=kǎoròu;烤鸭=kǎoyā;热心=rèxīn;热情=rèqíng;热烈=rèliè;热爱=rè'ài;
热量=rèliàng;热门=rèmén;热闹=rènao;然后=ránhòu;然而=rán'ér;煤气=méiqì;照片=zhàopiàn;照相=zhàoxiàng;
照顾=zhàogu;熟人=shúrén;熟悉=shúxi;熟练=shúliàn;燃料=ránliào;燃烧=ránshāo;爬山=pá shān;爱人=àiren;
爱国=àiguó;爱好=àihào;爱心=àixīn;爱情=àiqíng;爱护=àihù;父亲=fùqīn;父母=fùmǔ;爷爷=yéye;爸爸=bàba;
片面=piànmiàn;牌子=páizi;牙刷=yáshuā;牛仔裤=niúzǎikù;牛奶=niúnǎi;物业=wùyè;物价=wùjià;物质=wùzhì;
特价=tèjià;特别=tèbié;特定=tèdìng;特征=tèzhēng;特性=tèxìng;特有=tèyǒu;特殊=tèshū;特点=tèdiǎn;特色=tèsè;
状况=zhuàngkuàng;状态=zhuàngtài;犹豫=yóuyù;独特=dútè;独立=dúlì;独自=dúzì;猜测=cāicè;率先=shuàixiān;
率领=shuàilǐng;玉米=yùmǐ;玩儿=wánr;玩具=wánjù;环保=huánbǎo;环境=huánjìng;环节=huánjié;现代=xiàndài;
现在=xiànzài;现场=xiànchǎng;现实=xiànshí;现有=xiànyǒu;现状=xiànzhuàng;现象=xiànxiàng;现金=xiànjīn;
玻璃=bōli;珍惜=zhēnxī;珍珠=zhēnzhū;珍贵=zhēnguì;班级=bānjí;班长=bānzhǎng;球场=qiúchǎng;球迷=qiúmí;
球队=qiúduì;球鞋=qiúxié;理发=lǐfà;理想=lǐxiǎng;理由=lǐyóu;理解=lǐjiě;理论=lǐlùn;瓶子=píngzi;
甚至=shènzhì;生产=shēngchǎn;生动=shēngdòng;生命=shēngmìng;生存=shēngcún;生意=shēngyi;
生成=shēngchéng;生日=shēngrì;生气=shēngqì;生活=shēnghuó;生病=shēngbìng;生词=shēngcí;
生长=shēngzhǎng;用不着=yòngbuzháo;用于=yòngyú;用户=yònghù;用来=yònglái;用途=yòngtú;由于=yóuyú;
由此=yóu cǐ;申请=shēnqǐng;电动车=diàndòngchē;电台=diàntái;电子版=diànzǐbǎn;电子邮件=diànzǐ yóujiàn;
电影=diànyǐng;电影院=diànyǐngyuàn;电梯=diàntī;电池=diànchí;电源=diànyuán;电灯=diàndēng;电脑=diànnǎo;
电视=diànshì;电视剧=diànshìjù;电视台=diànshìtái;电视机=diànshìjī;电话=diànhuà;电饭锅=diànfànguō;
男人=nánrén;男士=nánshì;男女=nánnǚ;男子=nánzǐ;男孩儿=nánháir;男性=nánxìng;男朋友=nánpéngyou;
男生=nánshēng;画儿=huàr;画家=huàjiā;画面=huàmiàn;留下=liúxia;留学=liúxué;留学生=liúxuéshēng;
疑问=yíwèn;疗养=liáoyǎng;疯狂=fēngkuáng;病人=bìngrén;病毒=bìngdú;痛快=tòngkuài;痛苦=tòngkǔ;
登山=dēngshān;登录=dēnglù;登记=dēngjì;白天=báitiān;白色=báisè;白菜=báicài;白酒=báijiǔ;百货=bǎihuò;
的确=díquè;的话=dehuà;皮包=píbāo;皮肤=pífū;皮鞋=píxié;盒子=hézi;盒饭=héfàn;盘子=pánzi;目光=mùguāng;
目前=mùqián;目标=mùbiāo;目的=mùdì;直到=zhídào;直接=zhíjiē;直播=zhíbō;直线=zhíxiàn;相互=xiānghù;
相似=xiāngsì;相信=xiāngxìn;相关=xiāngguān;相反=xiāngfǎn;相同=xiāngtóng;相声=xiàngsheng;
相处=xiāngchǔ;相应=xiāngyìng;相当=xiāngdāng;相机=xiàngjī;相比=xiāngbǐ;相片=xiàngpiàn;
相等=xiāngděng;看上去=kàn shàngqu;看不起=kànbuqǐ;看出=kànchū;看到=kàndào;看待=kàndài;看成=kànchéng;
看望=kànwàng;看来=kànlai;看法=kànfǎ;看病=kànbìng;看见=kànjiàn;看起来=kàn qǐlai;真实=zhēnshí;
真正=zhēnzhèng;真理=zhēnlǐ;真的=zhēn de;真相=zhēnxiàng;真诚=zhēnchéng;眼光=yǎnguāng;眼前=yǎnqián;
眼泪=yǎnlèi;眼睛=yǎnjing;眼里=yǎnli;眼镜=yǎnjìng;着急=zháojí;着火=zháohuǒ;睡眠=shuìmián;
睡着=shuìzháo;睡觉=shuìjiào;矛盾=máodùn;知识=zhīshi;知道=zhīdào;短信=duǎnxìn;短处=duǎnchù;
短期=duǎnqī;短裤=duǎnkù;矮小=ǎixiǎo;石头=shítou;石油=shíyóu;矿泉水=kuàngquánshuǐ;码头=mǎtóu;
研制=yánzhì;研究=yánjiū;研究所=yánjiūsuǒ;研究生=yánjiūshēng;破产=pòchǎn;破坏=pòhuài;硕士=shuòshì;
硬件=yìngjiàn;确保=quèbǎo;确定=quèdìng;确实=quèshí;确立=quèlì;确认=quèrèn;碰到=pèngdào;碰见=pèngjiàn;
示范=shìfàn;礼拜=lǐbài;礼物=lǐwù;礼貌=lǐmào;社会=shèhuì;社区=shèqū;祝福=zhùfú;祝贺=zhùhè;神奇=shénqí;
神情=shénqíng;神秘=shénmì;神经=shénjīng;神话=shénhuà;票价=piàojià;禁止=jìnzhǐ;福利=fúlì;
离不开=lí bu kāi;离婚=líhūn;离开=líkāi;私人=sīrén;秋天=qiūtiān;秋季=qiūjì;种子=zhǒngzi;种植=zhòngzhí;
种类=zhǒnglèi;科学=kēxué;科技=kējì;秘书=mìshū;秘密=mìmì;积极=jījí;积累=jīlěi;称为=chēngwéi;
称号=chēnghào;称赞=chēngzàn;移动=yídòng;移民=yímín;程序=chéngxù;程度=chéngdù;稍微=shāowēi;
稳定=wěndìng;究竟=jiūjìng;穷人=qióngrén;空中=kōngzhōng;空儿=kòngr;空气=kōngqì;空调=kōngtiáo;
空间=kōngjiān;穿上=chuānshang;突出=tūchū;突然=tūrán;突破=tūpò;窗台=chuāngtái;窗子=chuāngzi;
窗帘=chuānglián;窗户=chuānghu;立刻=lìkè;立即=lìjí;立场=lìchǎng;站住=zhànzhù;竞争=jìngzhēng;
竞赛=jìngsài;竟然=jìngrán;童年=tóngnián;童话=tónghuà;竹子=zhúzi;笑话=xiàohua;笑话儿=xiàohuar;
笔记=bǐjì;笔记本=bǐjìběn;符号=fúhào;符合=fúhé;等于=děngyú;等候=děnghòu;等到=děngdào;等待=děngdài;
等级=děngjí;答复=dáfù;答应=dāying;答案=dá'àn;筷子=kuàizi;签名=qiānmíng;签字=qiānzì;签约=qiānyuē;
签订=qiāndìng;签证=qiānzhèng;简单=jiǎndān;简历=jiǎnlì;简直=jiǎnzhí;管理=guǎnlǐ;箱子=xiāngzi;
篮球=lánqiú;米饭=mǐfàn;类似=lèisì;类型=lèixíng;粗心=cūxīn;粮食=liángshi;精力=jīnglì;精彩=jīngcǎi;
精神=jīngshén;糟糕=zāogāo;系列=xìliè;系统=xìtǒng;紧密=jǐnmì;紧张=jǐnzhāng;紧急=jǐnjí;紧紧=jǐnjǐn;
繁荣=fánróng;红包=hóngbāo;红色=hóngsè;红茶=hóngchá;红酒=hóngjiǔ;约会=yuēhuì;约束=yuēshù;纪录=jìlù;
纪律=jìlǜ;纪念=jìniàn;纯净水=chúnjìngshuǐ;纷纷=fēnfēn;线索=xiànsuǒ;练习=liànxí;组合=zǔhé;组成=zǔchéng;
组织=zǔzhī;组长=zǔzhǎng;细致=xìzhì;细节=xìjié;终于=zhōngyú;终止=zhōngzhǐ;终点=zhōngdiǎn;
终身=zhōngshēn;经典=jīngdiǎn;经历=jīnglì;经常=jīngcháng;经济=jīngjì;经理=jīnglǐ;经营=jīngyíng;
经费=jīngfèi;经过=jīngguò;经验=jīngyàn;结合=jiéhé;结婚=jiéhūn;结实=jiēshi;结束=jiéshù;结构=jiégòu;
结果=jiéguǒ;结论=jiélùn;绝对=juéduì;绝望=juéwàng;统一=tǒngyī;统计=tǒngjì;继承=jìchéng;继续=jìxù;
维修=wéixiū;维护=wéihù;维持=wéichí;综合=zōnghé;绿色=lǜsè;绿茶=lǜchá;缓解=huǎnjiě;编辑=biānjí;
缩小=suōxiǎo;缩短=suōduǎn;缺乏=quēfá;缺少=quēshǎo;缺点=quēdiǎn;网上=wǎng shang;网友=wǎngyǒu;
网址=wǎngzhǐ;网球=wǎngqiú;网站=wǎngzhàn;网络=wǎngluò;罚款=fákuǎn;美丽=měilì;美元=měiyuán;美女=měinǚ;
美好=měihǎo;美术=měishù;美金=měijīn;美食=měishí;群众=qúnzhòng;群体=qúntǐ;羽毛球=yǔmáoqiú;
羽绒服=yǔróngfú;翻译=fānyì;老人=lǎorén;老公=lǎogōng;老太太=lǎotàitai;老头儿=lǎotóur;老婆=lǎopo;
老实=lǎoshi;老家=lǎojiā;老师=lǎoshī;老年=lǎonián;老是=lǎoshi;老朋友=lǎo péngyou;老板=lǎobǎn;
老百姓=lǎobǎixìng;考察=kǎochá;考核=kǎohé;考生=kǎoshēng;考虑=kǎolǜ;考试=kǎoshì;考验=kǎoyàn;而且=érqiě;
而是=ér shì;耐心=nàixīn;耳朵=ěrduo;耳机=ěrjī;职业=zhíyè;职位=zhíwèi;职务=zhíwù;职工=zhígōng;
职能=zhínéng;联合=liánhé;联合国=Liánhéguó;联想=liánxiǎng;联系=liánxì;联络=liánluò;聚会=jùhuì;
聪明=cōngming;肌肉=jīròu;肚子=dùzi;肯定=kěndìng;胆小=dǎnxiǎo;背包=bēibāo;背后=bèihòu;背景=bèijǐng;
胖子=pàngzi;胜利=shènglì;胜负=shèngfù;胡同儿=hútòngr;胡子=húzi;胶带=jiāodài;胶水=jiāoshuǐ;
胸部=xiōngbù;能不能=néng bu néng;能力=nénglì;能够=nénggòu;能干=nénggàn;能量=néngliàng;脑子=nǎozi;
脑袋=nǎodai;脚步=jiǎobù;脱离=tuōlí;脸盆=liǎnpén;脸色=liǎnsè;脾气=píqi;自主=zìzhǔ;自从=zìcóng;
自信=zìxìn;自动=zìdòng;自己=zìjǐ;自愿=zìyuàn;自杀=zìshā;自然=zìrán;自由=zìyóu;自行车=zìxíngchē;
自觉=zìjué;自豪=zìháo;自身=zìshēn;至今=zhìjīn;至少=zhìshǎo;舍不得=shěbude;舍得=shěde;舒服=shūfu;
舒适=shūshì;舞台=wǔtái;航班=hángbān;航空=hángkōng;良好=liánghǎo;艰苦=jiānkǔ;艰难=jiānnán;色彩=sècǎi;
艺术=yìshù;节日=jiérì;节目=jiémù;节省=jiéshěng;节约=jiéyuē;花园=huāyuán;英勇=yīngyǒng;英文=Yīngwén;
英语=Yīngyǔ;苹果=píngguǒ;范围=fànwéi;茶叶=cháyè;草原=cǎoyuán;草地=cǎodì;药店=yàodiàn;药水=yàoshuǐ;
药片=yàopiàn;药物=yàowù;获取=huòqǔ;获奖=huòjiǎng;获得=huòdé;菜单=càidān;营业=yíngyè;营养=yíngyǎng;
落后=luòhòu;落实=luòshí;著作=zhùzuò;著名=zhùmíng;葡萄=pútao;葡萄酒=pútaojiǔ;蓝色=lánsè;蔬菜=shūcài;
薄弱=bóruò;虚心=xūxīn;虫子=chóngzi;虽然=suīrán;蛋糕=dàngāo;行业=hángyè;行为=xíngwéi;行人=xíngrén;
行动=xíngdòng;行李=xíngli;行驶=xíngshǐ;街道=jiēdào;衣服=yīfu;衣架=yījià;补偿=bǔcháng;补充=bǔchōng;
补贴=bǔtiē;表情=biǎoqíng;表扬=biǎoyáng;表明=biǎomíng;表格=biǎogé;表演=biǎoyǎn;表现=biǎoxiàn;
表示=biǎoshì;表达=biǎodá;表面=biǎomiàn;衬衣=chènyī;衬衫=chènshān;袜子=wàzi;被动=bèidòng;被子=bèizi;
被迫=bèipò;裁判=cáipàn;装修=zhuāngxiū;装置=zhuāngzhì;装饰=zhuāngshì;裙子=qúnzi;裤子=kùzi;西北=xīběi;
西医=xīyī;西南=xīnán;西方=xīfāng;西瓜=xīguā;西红柿=xīhóngshì;西装=xīzhuāng;西边=xībian;西部=xībù;
西餐=xīcān;要是=yàoshi;要求=yāoqiú;见到=jiàndào;见过=jiànguo;见面=jiànmiàn;观众=guānzhòng;
观察=guānchá;观念=guānniàn;观点=guāndiǎn;观看=guānkàn;规划=guīhuà;规则=guīzé;规定=guīdìng;规律=guīlǜ;
规模=guīmó;规范=guīfàn;视为=shìwéi;视频=shìpín;觉得=juéde;角度=jiǎodù;角色=juésè;解决=jiějué;
解开=jiěkāi;解放=jiěfàng;解释=jiěshì;解除=jiěchú;言语=yányǔ;警告=jǐnggào;警察=jǐngchá;计划=jìhuà;
计算=jìsuàn;计算机=jìsuànjī;认为=rènwéi;认出=rènchū;认可=rènkě;认定=rèndìng;认得=rènde;认真=rènzhēn;
认识=rènshi;讨厌=tǎoyàn;讨论=tǎolùn;训练=xùnliàn;议论=yìlùn;记住=jìzhu;记录=jìlù;记得=jìde;记忆=jìyì;
记者=jìzhě;记载=jìzǎi;讲座=jiǎngzuò;讲究=jiǎngjiu;讲话=jiǎnghuà;许可=xǔkě;许多=xǔduō;论文=lùnwén;
设备=shèbèi;设想=shèxiǎng;设施=shèshī;设立=shèlì;设置=shèzhì;设计=shèjì;访问=fǎngwèn;证书=zhèngshū;
证件=zhèngjiàn;证实=zhèngshí;证据=zhèngjù;证明=zhèngmíng;评价=píngjià;评估=pínggū;评论=pínglùn;
诊断=zhěnduàn;词典=cídiǎn;词汇=cíhuì;词语=cíyǔ;试卷=shìjuàn;试图=shìtú;试题=shìtí;试验=shìyàn;
诗人=shīrén;诗歌=shīgē;诚信=chéngxìn;诚实=chéngshí;话剧=huàjù;话题=huàtí;询问=xúnwèn;详细=xiángxì;
语法=yǔfǎ;语言=yǔyán;语音=yǔyīn;误会=wùhuì;误解=wùjiě;说不定=shuōbudìng;说明=shuōmíng;说服=shuōfú;
说法=shuōfǎ;说话=shuōhuà;请假=qǐngjià;请坐=qǐng zuò;请客=qǐngkè;请教=qǐngjiào;请求=qǐngqiú;
请进=qǐng jìn;请问=qǐngwèn;读书=dúshū;读者=dúzhě;读音=dúyīn;课堂=kètáng;课文=kèwén;课本=kèběn;
课程=kèchéng;课题=kètí;调动=diàodòng;调整=tiáozhěng;调查=diàochá;调皮=tiáopí;调节=tiáojié;
调解=tiáojiě;谈判=tánpàn;谈话=tánhuà;谢谢=xièxie;豆制品=dòuzhìpǐn;豆腐=dòufu;象征=xiàngzhēng;
负担=fùdān;负责=fùzé;负责人=fùzérén;财产=cáichǎn;财富=cáifù;责任=zérèn;质量=zhìliàng;购买=gòumǎi;
购物=gòuwù;贷款=dàikuǎn;贸易=màoyì;费用=fèiyong;贺卡=hèkǎ;资产=zīchǎn;资助=zīzhù;资料=zīliào;
资本=zīběn;资格=zīgé;资源=zīyuán;资金=zījīn;赔偿=péicháng;赞助=zànzhù;赞成=zànchéng;赞赏=zànshǎng;
赠送=zèngsòng;赢得=yíngdé;走开=zǒukāi;走路=zǒulù;走过=zǒuguò;走进=zǒujìn;赶到=gǎndào;赶快=gǎnkuài;
赶紧=gǎnjǐn;起到=qǐdào;起床=qǐchuáng;起来=qǐlai;起码=qǐmǎ;起飞=qǐfēi;超市=chāoshì;超级=chāojí;
超越=chāoyuè;超过=chāoguò;越来越=yuè lái yuè;趋势=qūshì;足够=zúgòu;足球=zúqiú;跑步=pǎobù;距离=jùlí;
跟前=gēnqián;跟随=gēnsuí;路上=lùshang;路口=lùkǒu;路线=lùxiàn;路边=lù biān;跳舞=tiàowǔ;跳远=tiàoyuǎn;
跳高=tiàogāo;身上=shēnshang;身份=shēnfèn;身份证=shēnfènzhèng;身体=shēntǐ;身材=shēncái;身边=shēnbiān;
身高=shēngāo;车上=chē shang;车主=chēzhǔ;车票=chēpiào;车站=chēzhàn;车辆=chēliàng;转动=zhuǎndòng;
转化=zhuǎnhuà;转变=zhuǎnbiàn;转向=zhuǎnxiàng;转告=zhuǎngào;转弯=zhuǎnwān;转换=zhuǎnhuàn;
转移=zhuǎnyí;转让=zhuǎnràng;转身=zhuǎnshēn;轮子=lúnzi;轮椅=lúnyǐ;轮船=lúnchuán;软件=ruǎnjiàn;
轻易=qīngyì;轻松=qīngsōng;辅助=fǔzhù;输入=shūrù;输出=shūchū;辛苦=xīnkǔ;辞典=cídiǎn;辞职=cízhí;
辩论=biànlùn;边境=biānjìng;达到=dádào;达成=dáchéng;迅速=xùnsù;过于=guòyú;过分=guòfèn;过去=guòqù;
过年=guònián;过度=guòdù;过敏=guòmǐn;过来=guòlái;过程=guòchéng;迎接=yíngjiē;运动=yùndòng;
运动会=yùndònghuì;运动员=yùndòngyuán;运气=yùnqi;运用=yùnyòng;运行=yùnxíng;运输=yùnshū;近代=jìndài;
近期=jìnqī;近来=jìnlái;返回=fǎnhuí;还是=háishi;还有=hái yǒu;这么=zhème;这些=zhèxiē;这儿=zhèr;
这时候=zhè shíhou;这样=zhèyàng;这边=zhèbiān;这里=zhèlǐ;进一步=jìnyíbù;进入=jìnrù;进化=jìnhuà;
进去=jìnqù;进口=jìnkǒu;进展=jìnzhǎn;进来=jìnlái;进步=jìnbù;进行=jìnxíng;远处=yuǎnchù;违反=wéifǎn;
违法=wéifǎ;违规=wéiguī;连忙=liánmáng;连接=liánjiē;连续=liánxù;连续剧=liánxùjù;迟到=chídào;迫切=pòqiè;
迷人=mírén;迷信=míxìn;追求=zhuīqiú;退休=tuìxiū;退出=tuìchū;送到=sòngdào;送给=sòng gěi;适合=shìhé;
适应=shìyìng;适用=shìyòng;逃走=táozǒu;逃跑=táopǎo;选修=xuǎnxiū;选手=xuǎnshǒu;选择=xuǎnzé;
透明=tòumíng;逐步=zhúbù;逐渐=zhújiàn;递给=dì gěi;途中=túzhōng;通信=tōngxìn;通常=tōngcháng;
通用=tōngyòng;通知=tōngzhī;通知书=tōngzhīshū;通过=tōngguò;速度=sùdù;造型=zàoxíng;造成=zàochéng;
逻辑=luóji;遇到=yùdào;遇见=yùjiàn;道德=dàodé;道理=dàoli;道路=dàolù;遗产=yíchǎn;遗传=yíchuán;
遵守=zūnshǒu;避免=bìmiǎn;邀请=yāoqǐng;那么=nàme;那些=nàxiē;那会儿=nàhuìr;那儿=nàr;那时候=nà shíhou;
那样=nàyàng;那边=nàbian;那里=nàli;邮件=yóujiàn;邮局=yóujú;邮票=yóupiào;邮箱=yóuxiāng;邻居=línjū;
郊区=jiāoqū;部位=bùwèi;部分=bùfen;部长=bùzhǎng;部门=bùmén;配合=pèihé;配备=pèibèi;配套=pèitào;
酒吧=jiǔbā;酒店=jiǔdiàn;酒鬼=jiǔguǐ;酸奶=suānnǎi;酸甜苦辣=suān-tián-kǔ-là;采取=cǎiqǔ;采用=cǎiyòng;
采访=cǎifǎng;采购=cǎigòu;里头=lǐtou;里边=lǐbian;里面=lǐmiàn;重复=chóngfù;重大=zhòngdà;重新=chóngxīn;
重点=zhòngdiǎn;重要=zhòngyào;重视=zhòngshì;重量=zhòngliàng;金牌=jīnpái;针对=zhēnduì;钢琴=gāngqín;
钢笔=gāngbǐ;钱包=qiánbāo;铁路=tiělù;铃声=língshēng;银牌=yínpái;银行=yínháng;银行卡=yínhángkǎ;
销售=xiāoshòu;错误=cuòwù;键盘=jiànpán;锻炼=duànliàn;镜头=jìngtóu;镜子=jìngzi;长城=Chángchéng;
长处=chángchù;长大=zhǎngdà;长寿=chángshòu;长度=chángdù;长期=chángqī;长途=chángtú;门口=ménkǒu;
门票=ménpiào;门诊=ménzhěn;闪电=shǎndiàn;闭幕=bìmù;闭幕式=bìmùshì;问候=wènhòu;问路=wènlù;问题=wèntí;
间接=jiànjiē;闹钟=nàozhōng;阅览室=yuèlǎnshì;阅读=yuèdú;队员=duìyuán;队长=duìzhǎng;防止=fángzhǐ;
防治=fángzhì;阳光=yángguāng;阳台=yángtái;阴天=yīntiān;阶段=jiēduàn;阻止=zǔzhǐ;阻碍=zǔ'ài;阿姨=āyí;
附件=fùjiàn;附近=fùjìn;陆地=lùdì;陆续=lùxù;降价=jiàngjià;降低=jiàngdī;降温=jiàngwēn;降落=jiàngluò;
限制=xiànzhì;院子=yuànzi;院长=yuànzhǎng;除了=chúle;除夕=chúxī;除非=chúfēi;随便=suíbiàn;随后=suíhòu;
随意=suíyì;随手=suíshǒu;随时=suíshí;随着=suízhe;隔壁=gébì;隔开=gékāi;难以=nányǐ;难免=nánmiǎn;
难受=nánshòu;难听=nántīng;难度=nándù;难得=nándé;难看=nánkàn;难过=nánguò;难道=nándào;难题=nántí;
雄伟=xióngwěi;集中=jízhōng;集体=jítǐ;集合=jíhé;集团=jítuán;雨水=yǔshuǐ;零下=líng xià;零食=língshí;
需求=xūqiú;需要=xūyào;震惊=zhènjīng;青少年=qīng-shàonián;青年=qīngnián;青春=qīngchūn;非常=fēicháng;
靠近=kàojìn;面临=miànlín;面前=miànqián;面包=miànbāo;面子=miànzi;面对=miànduì;面条儿=miàntiáor;
面积=miànjī;面试=miànshì;面貌=miànmào;音乐=yīnyuè;音乐会=yīnyuèhuì;音节=yīnjié;项目=xiàngmù;
顺利=shùnlì;顺序=shùnxù;顾客=gùkè;顾问=gùwèn;预习=yùxí;预备=yùbèi;预报=yùbào;预期=yùqī;预测=yùcè;
预计=yùjì;预订=yùdìng;预防=yùfáng;领先=lǐngxiān;领导=lǐngdǎo;领带=lǐngdài;频繁=pínfán;频道=píndào;
题材=tícái;题目=tímù;颜色=yánsè;风俗=fēngsú;风光=fēngguāng;风度=fēngdù;风景=fēngjǐng;风格=fēnggé;
风险=fēngxiǎn;飞机=fēijī;飞行=fēixíng;食品=shípǐn;食堂=shítáng;食物=shíwù;餐厅=cāntīng;餐饮=cānyǐn;
餐馆=cānguǎn;饭店=fàndiàn;饭馆=fànguǎn;饮料=yǐnliào;饮食=yǐnshí;饺子=jiǎozi;饼干=bǐnggān;
首先=shǒuxiān;首都=shǒudū;香肠=xiāngcháng;香蕉=xiāngjiāo;马上=mǎshàng;马路=mǎlù;驾照=jiàzhào;
驾驶=jiàshǐ;骑车=qí chē;骗子=piànzi;骨头=gǔtou;高中=gāozhōng;高于=gāoyú;高价=gāojià;高兴=gāoxìng;
高原=gāoyuán;高大=gāodà;高尚=gāoshàng;高度=gāodù;高温=gāowēn;高潮=gāocháo;高级=gāojí;高跟鞋=gāogēnxié;
高速=gāosù;高速公路=gāosù gōnglù;高铁=gāotiě;鲜明=xiānmíng;鲜艳=xiānyàn;鲜花=xiānhuā;鸡蛋=jīdàn;
鸭子=yāzi;麻烦=máfan;黄瓜=huángguā;黄色=huángsè;黄金=huángjīn;黑暗=hēi'àn;黑板=hēibǎn;黑色=hēisè;
默默=mòmò;鼓励=gǔlì;鼓掌=gǔzhǎng;鼠标=shǔbiāo;鼻子=bízi;齐全=qíquán;
`;

/** One word the sentence speller can recognise. */
export interface LexWord {
	/** Simplified hanzi, e.g. 不客气. */
	hanzi: string;
	/** The official spelling, e.g. `bú kèqì`. */
	pinyin: string;
	/** `pinyin` cut into syllables, one per character of `hanzi`. */
	syllables: Syllable[];
	/**
	 * What the spelling writes BETWEEN its syllables — `['', '']` for 夏天 (`xiàtiān`),
	 * `[' ', '']` for 不客气 (`bú kèqì`), `["'"]` for 女儿 (`nǚ'ér`). Length is one less than
	 * `syllables`. This is the whole point of the file: it is the word boundary, in writing.
	 */
	joins: string[];
	/** True for the 15 proper nouns the list capitalises (北京 `Běijīng`, 汉语 `Hànyǔ`). */
	proper: boolean;
}

/** No word in the shipped list is longer than four characters. */
export const LONGEST_WORD = 4;

/** Lower-cased tone-marked syllable — the key a sentence's own syllables are looked up by. */
export function soundKey(syllables: readonly Syllable[]): string {
	return syllables.map((s) => s.py.toLowerCase()).join('+');
}

let byHanzi: Map<string, LexWord> | null = null;
let bySound: Map<string, LexWord> | null = null;

/**
 * Parsed on first use, not at import: a page that renders no sentence never pays for it, and
 * the 3,363 segmentations cost ~10 ms once.
 */
function index(): { byHanzi: Map<string, LexWord>; bySound: Map<string, LexWord> } {
	if (byHanzi === null || bySound === null) {
		byHanzi = new Map();
		bySound = new Map();
		for (const row of TABLE.split(/[;\n]+/u)) {
			const at = row.indexOf('=');
			if (at < 0) continue;
			const hanzi = row.slice(0, at);
			const pinyin = row.slice(at + 1);
			const syllables = segmentPinyin(pinyin);
			const seps = sourceSeparators(pinyin, syllables);
			if (seps === null || syllables.length !== [...hanzi].length) continue;
			const word: LexWord = {
				hanzi,
				pinyin,
				syllables,
				joins: seps.slice(1, syllables.length),
				proper: pinyin[0] !== pinyin[0].toLowerCase()
			};
			byHanzi.set(hanzi, word);
			const key = soundKey(syllables);
			if (!bySound.has(key)) bySound.set(key, word);
		}
	}
	return { byHanzi, bySound };
}

/** The word written with these characters, if the list has one. */
export function wordOf(hanzi: string): LexWord | undefined {
	return index().byHanzi.get(hanzi);
}

/**
 * The word that SOUNDS like these syllables, if exactly one does.
 *
 * Weaker than `wordOf` and used only where the caller holds no characters — the browse sheet
 * hands `<Pinyin>` syllables alone. Tone-marked, so 有 `yǒu` never collides with 游 `yóu`; the
 * homophones that survive that (时间/事件 both `shíjiān`) are both real words and both join, so
 * the printed spelling is right either way.
 */
export function wordLike(syllables: readonly Syllable[]): LexWord | undefined {
	return index().bySound.get(soundKey(syllables));
}

/** How many words the lexicon holds. Asserted against the corpus in `pinyin.spec.ts`. */
export function lexiconSize(): number {
	return index().byHanzi.size;
}
