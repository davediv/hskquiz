/**
 * What a single character means, for the 640 characters that are not themselves HSK words.
 *
 * WHY THIS FILE EXISTS AND WHY IT IS HAND-WRITTEN
 * 1,500 distinct characters build the 4,308 words we ship. 860 of them are also words in their
 * own right — 安 is HSK 4, 好 is HSK 1 — so the character card can just show that entry's own
 * gloss, which the build already verified against the official list. The other 640 (慰, 萄, 圾)
 * never appear alone in HSK 1–5, so the corpus has nothing to say about them, and a card
 * showing 慰 · wèi · 4th tone and no meaning is two inert tone labels — exactly the thing the
 * strip was criticised for.
 *
 * These are therefore UI copy, not vocabulary data: they do not come out of `reference/`, they
 * are not in `Word`, and nothing is quizzed on them. They are written to the same standard as
 * the glosses in the word list — a few words, learner-facing, the character's core sense first
 * and a bound-form note (`(in 葡萄, grape)`) where the character genuinely has no life of its
 * own in modern Chinese.
 *
 * THE FORMAT is one entry per line, `<character><space><gloss>`, ordered by how often the
 * character turns up in the corpus so the entries a learner meets most are at the top and
 * easiest to review. `related.spec.ts` holds it to full coverage in both directions: a character
 * that is not a word and not listed here fails, and so does an entry for a character that has
 * since become a word of its own.
 */

const TABLE = `
儿 child; noun suffix
实 solid, real
体 body, form
机 machine; opportunity
公 public; male (of animals)
理 reason, logic; to manage
业 trade, line of work
然 so, thus; -ly
于 in, at, to
作 to do, to make
明 bright; clear
意 idea, intention
工 work, labour
相 each other; appearance
主 host, owner; main
以 by means of; with
文 writing, culture
现 present, now; to appear
利 profit, benefit; sharp
制 to make; system
客 guest, visitor
身 body; oneself
情 feeling, emotion
物 thing, object
同 same, together
如 like, as; if
经 to pass through; classic
么 (suffix in 什么, 怎么)
语 language, speech
感 to feel; feeling
特 special
原 original; plain
产 to produce; product
解 to untie, to solve
视 to look at; vision
友 friend
果 fruit; result
样 shape, kind
复 to repeat; again
餐 a meal
论 to discuss; theory
民 the people
规 rule, regulation
消 to vanish; to remove
之 of; it (classical)
服 clothes; to serve
观 to observe; view
计 to count; a plan
入 to enter
确 sure, accurate
格 pattern, standard
导 to lead, to guide
剧 drama, play
象 elephant; image
资 resources, capital
形 shape, form
预 in advance
士 scholar; person of standing
模 model, pattern
影 shadow; film
商 trade; to discuss
候 to wait; a time
馆 hall, public building
音 sound
便 convenient
务 affair, duty
目 eye; item
展 to unfold, to exhibit
房 house, room
告 to tell, to announce
衣 clothing
示 to show
食 food; to eat
标 mark, standard
续 to continue
除 to remove; except
夫 man, husband
止 to stop
设 to set up
验 to test, to examine
失 to lose
望 to gaze; to hope
优 excellent
专 special, exclusive
料 material; to expect
今 now, today
师 teacher, master
朋 friend
午 noon
星 star
习 to practise
医 medicine, to heal
助 to help
思 to think
典 standard work, canon
园 garden
温 warm; temperature
持 to hold, to maintain
达 to reach
充 to fill; sufficient
程 procedure; journey
速 speed, fast
具 tool; to possess
注 to pour; to note
联 to join, to link
议 to discuss; a proposal
及 to reach; and
术 skill, art
决 to decide
景 view, scenery
足 foot; enough
职 post, duty
码 code, number
依 to depend on
脑 brain
什 what (in 什么)
觉 to sense, to feel
备 to prepare; equipment
顾 to look after
适 to suit, fitting
护 to protect
育 to raise, to educate
旅 to travel
态 state, attitude
许 to allow; perhaps
播 to broadcast, to sow
创 to create
邮 post, mail
众 crowd, the many
器 vessel, device
基 base, foundation
集 to gather; a collection
纪 record; era; discipline
坚 firm, solid
易 easy; to exchange
尽 to use up; to the utmost
据 according to; evidence
世 world; generation
终 end; finally
志 will, ambition; a record
置 to place, to set up
承 to bear, to undertake
担 to carry, to shoulder
统 to unify; system
闭 to close, to shut
律 law, rule
究 to investigate
战 war, to fight
维 to maintain; fibre
博 broad, extensive
摄 to take in; to photograph
兴 to rise; interest
孩 child
玩 to play
姐 older sister
汽 steam, vapour
识 to recognise, to know
休 to rest
息 breath; to rest; news
怎 how
知 to know
参 to take part; to consult
超 to exceed
春 spring, the season
印 to print; a mark
故 reason; old; on purpose
际 boundary; occasion
检 to inspect
例 example, precedent
普 general, universal
清 clear, clean
因 cause, because
赛 contest, match
采 to pick, to gather
彩 colour; brilliance
功 merit, achievement
误 a mistake; to delay
范 model; scope
否 to negate; or not
负 to bear; negative
责 duty; to blame
积 to accumulate; area
技 skill
警 to warn; police
材 material, timber
历 to go through; history
精 refined; essence; energy
似 to resemble
农 farming
评 to comment, to judge
石 stone
界 boundary, world
突 sudden; to break through
善 good, kind; good at
卫 to guard; hygiene
效 effect; to imitate
状 shape; condition
训 to instruct, to train
义 meaning; justice
势 power, momentum, situation
巴 to cling to; (in 巴士, bus)
免 to avoid, to exempt
乎 (classical particle: in, at)
途 road, way
赞 to praise, to approve
窗 window
独 alone, single
致 to send, to cause; fine
趣 interest, delight
构 to construct; structure
购 to buy
率 rate, ratio
居 to reside
良 good, fine
培 to cultivate
质 quality, substance
限 a limit
征 to levy; a sign; to seek
微 tiny, slight
延 to extend, to delay
研 to grind; to research
幕 curtain, screen; an act
辑 to edit, to compile
款 a sum of money; style
哥 older brother
喜 to like; joy
欢 joyful
校 school
司 to manage; an office
健 healthy, strong
秋 autumn
顺 to follow; smooth
阳 sun; bright; yang
味 taste, flavour
英 outstanding; England
言 word, to speak
险 danger; steep
概 general, approximate
裤 trousers
访 to visit, to call on
母 mother
察 to examine closely
奇 strange, rare
互 mutual
华 splendid; China
简 simple; brief
婚 marriage
营 to operate; a camp
绝 to cut off; absolutely
始 to begin
命 life; fate; an order
容 to contain; appearance
判 to judge
烈 fierce, intense
沙 sand
幸 good fortune
需 to need
艺 art, skill
括 to include, to enclose
迫 to force; urgent
毕 to finish; complete
操 to handle; drill
叶 leaf
默 silent
诚 sincere, honest
售 to sell
激 to stir up; intense
促 to urge, to hasten
销 to sell; to melt down
施 to carry out, to apply
案 case, plan, file
陆 land
源 source
豆 bean
童 child
奋 to rouse oneself, to strive
则 a rule; then
临 to face; about to
怀 bosom; to cherish
疑 to doubt
即 at once; namely
竟 in the end; unexpectedly
镜 mirror, lens
疗 to treat medically
秘 secret
燃 to burn
林 woods, forest
著 to write; marked
勇 brave
招 to beckon, to recruit
摩 to rub
览 to view, to look over
饮 to drink
池 pool, pond
扰 to disturb
享 to enjoy
军 army
漫 to overflow; free; long
偶 by chance; a pair; an idol
频 frequent; frequency
启 to open, to start
舍 to give up; a house
违 to disobey
珍 precious; to treasure
京 a capital city
弟 younger brother
净 clean
诉 to tell; to sue
汉 Han, Chinese
介 to be between; to introduce
妈 mum
妹 younger sister
谢 to thank
爷 grandfather; sir
桌 table
冬 winter
且 moreover; for the moment
忽 suddenly; to neglect
迎 to greet, to welcome
堂 hall
舒 to stretch out; at ease
讨 to demand; to discuss
夏 summer
颜 face; colour
椅 chair
般 sort, kind
晨 early morning
衬 to line; an undergarment
丰 abundant
父 father
杂 mixed, miscellaneous
娘 woman; mother
庆 to celebrate
境 border; circumstances
继 to continue, to succeed to
浪 wave; unrestrained
另 other, separate
族 clan, ethnic group
况 situation
何 what, how
危 danger, peril
伟 great
武 military, martial
宣 to declare
泳 to swim
财 wealth
序 order, sequence
惊 to startle
席 seat, mat
址 site, location
梯 ladder, stairs
耳 ear
挥 to wave, to wield
斗 to fight
妻 wife
符 to match; a symbol
附 to attach; nearby
供 to supply
固 solid, firm
寒 cold
航 to navigate, to fly
毫 fine hair; one thousandth
呼 to breathe out, to call
载 to carry; to record
渐 gradually
阶 step, rank
距 distance from
扩 to expand
益 benefit
巾 cloth, towel
描 to trace, to depict
余 surplus, remaining
劲 strength, energy
塑 to mould
孙 grandchild
缩 to shrink
络 net; to link up
未 not yet
寻 to search for
亚 second; Asia
遗 to leave behind; to lose
阅 to read, to review
召 to summon, to call
政 government, politics
植 to plant
智 wisdom
逐 to chase; one by one
阻 to block
慰 to console
拜 to pay respects
扮 to dress up as
悲 sorrow
耐 to endure
偿 to repay, to compensate
裁 to cut out; to judge
询 to inquire
寿 long life
倡 to advocate
辞 words; to take leave
击 to strike
糕 cake
震 to shake
繁 numerous, complex
荣 glory; flourishing
钢 steel
壁 wall
估 to estimate
励 to encourage
掌 palm; to be in charge of
柜 cupboard, counter
敏 quick, sensitive
贺 to congratulate
胡 recklessly; a beard
忆 to recall
驾 to drive, to harness
驶 to drive fast, to sail
艰 arduous
胶 glue, rubber
竞 to compete
烤 to roast, to bake
鸭 duck
惜 to cherish; to regret
朗 bright, clear
貌 appearance
厉 stern, severe
诊 to examine a patient
托 to hold up; to entrust
仔 a young animal; careful
葡 (in 葡萄, grape)
萄 (in 葡萄, grape)
惠 favour, benefit
索 rope; to search
损 to damage
污 dirty, to pollute
协 to join with, to assist
旦 dawn, daybreak
拥 to embrace; to have
羽 feather
暂 for a short time
尊 to honour
爸 dad
绍 to carry on; to introduce
昨 yesterday
须 must
绩 achievement, results
庭 courtyard; a hall
康 healthy, at peace
饺 dumpling
筷 chopsticks
篮 basket
努 to exert oneself
宜 suitable, fitting
漂 to bleach; (in 漂亮, pretty)
楚 clear, distinct
虽 although
惯 accustomed to
澡 to bathe
睛 eyeball
永 forever
己 oneself
衫 shirt
姑 aunt; a girl
汁 juice
哈 (the sound of laughter)
础 foundation stone
济 to help; to cross a river
咖 (in 咖啡, coffee)
啡 (in 咖啡, coffee)
恐 to fear
麻 hemp; numb
媒 go-between, medium
丽 beautiful
木 tree, wood
啤 (in 啤酒, beer)
苹 (in 苹果, apple)
裙 skirt
币 currency
章 chapter; a seal
希 to hope for; rare
蕉 (in 香蕉, banana)
李 plum; the surname Li
阿 (prefix on names and kin terms)
姨 mother's sister, aunt
裹 to wrap
贝 shell; treasure
辩 to argue, to debate
扬 to raise, to spread
与 with, and; to give
彻 thorough, penetrating
虫 insect, worm
措 to arrange, to handle
雷 thunder
敌 enemy
腐 rotten; bean curd
肚 belly
锻 to forge metal
炼 to smelt, to temper
恶 evil; to loathe
译 to translate
映 to reflect, to shine
纷 numerous and confused
俗 custom; common
妇 a married woman
尚 still; to esteem
骨 bone
缓 slow; to ease
伴 companion
授 to hand over, to teach
释 to explain; to release
禁 to forbid
巨 huge
虑 to consider; anxiety
矿 ore, a mine
垃 (in 垃圾, rubbish)
圾 (in 垃圾, rubbish)
婆 old woman; wife
厘 one hundredth
史 history
粮 grain, food
帽 hat
述 to state, to narrate
宁 peaceful, calm
均 even, equal
企 to plan; to stand on tiptoe
趋 to hurry towards; a tendency
权 power, a right
森 dense woods
申 to state, to apply
甚 very, extremely
叔 father's younger brother
暑 summer heat
殊 different, special
袜 socks
尾 tail
聊 to chat; slightly
谓 to say, to call
郎 young man
兄 elder brother
胸 chest
择 to choose
迅 swift
秀 outstanding; to flower
幼 young, infant
丈 husband; ten feet
府 a government office
综 to sum up
鼻 nose
彼 that; the other one
宾 guest
玻 (in 玻璃, glass)
璃 (in 玻璃, glass)
夕 evening
厨 kitchen
帘 curtain
聪 quick of hearing, clever
纲 outline, guiding principle
贷 to lend, to borrow
德 virtue, morals
返 to return
弃 to abandon
析 to split, to analyse
辅 to assist
革 leather; to change
曲 tune; bent
冠 crown; first place
泛 to float; widespread
籍 register; native place
悔 to regret
灰 ash, grey
恢 to restore
柴 firewood
肌 muscle, flesh
筑 to build
郊 outskirts
触 to touch
拒 to refuse
俱 all, together
核 pit, core; to check
怜 to pity
肯 to be willing
控 to control; to accuse
劳 to toil; labour
润 moist; profit
恋 to love, to long for
邻 neighbour
逻 to patrol
矛 spear
盾 shield
贸 to trade
仿 to imitate
糊 paste; blurred
龄 age, years
尔 you (classical); thus
肤 skin
脾 spleen
坦 level; frank
悄 quietly
勤 diligent
域 territory, area
乏 lacking; weary
漠 desert; indifferent
傅 tutor, master
蔬 vegetables
悉 to know fully
眠 to sleep
硕 large; master's degree
私 private, personal
宿 to stay the night
厌 to be fed up with
唯 only, alone
委 to entrust
卧 to lie down
奈 how; to do about
柿 persimmon
艳 gorgeous, brightly coloured
详 detailed
辛 bitter, toilsome
欣 glad
雄 male; grand
虚 empty; false; modest
押 to pledge; to detain
肃 solemn, respectful
邀 to invite
幽 secluded, deep
尤 particularly
犹 still; to hesitate
豫 (in 犹豫, to hesitate)
谊 friendship
绒 fine wool, down
珠 pearl, bead
振 to shake, to rouse
执 to hold; to carry out
央 centre
竹 bamboo
饰 to adorn
豪 grand, heroic
碍 to hinder
织 to weave
敬 to respect
遵 to comply with
`;

function parse(table: string): Record<string, string> {
	const map: Record<string, string> = Object.create(null) as Record<string, string>;
	for (const raw of table.split('\n')) {
		const line = raw.trim();
		if (line === '') continue;
		const [char] = line;
		map[char] = line.slice(char.length).trim();
	}
	return map;
}

/** Character → short English. Prototype-free, so a character called `constructor` is a miss. */
export const CHARACTER_GLOSS: Readonly<Record<string, string>> = parse(TABLE);
