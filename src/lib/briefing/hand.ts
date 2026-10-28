import { applyAuthored } from "./ideas";
import type { MatchEvent, Risk, Tip } from "./types";

type HandIdea = {
  home: RegExp;
  away: RegExp;
  market: string;
  pick: string;
  oddsHint: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  risk: Risk;
  rationale: string;
};

const HAND: HandIdea[] = [
  {
    home: /washington|capitals|кэпиталз|вашингтон/i,
    away: /pittsburgh|penguins|пингвин/i,
    market: "Исход",
    pick: "П1",
    oddsHint: "~1.55–1.75",
    confidence: 3,
    risk: "medium",
    rationale:
      "НХЛ, 02:30 МСК. Кэпиталз дома (−162), Пингвинз чуть лучше по старту (2-1-0 против 1-1-0). Берём хозяев без форы: голый домашний фаворит, не −1.5 шайбы.",
  },
  {
    home: /winnipeg|jets|виннипег/i,
    away: /colorado|avalanche|авеланч/i,
    market: "Исход",
    pick: "П2",
    oddsHint: "~1.45–1.65",
    confidence: 4,
    risk: "low",
    rationale:
      "НХЛ, 02:30 МСК. Авеланч 2-0-0, линия на гостей около −192. Виннипег 2-0-1 тоже живой, поэтому не фора гостей, а чистый П2 — самый ровный хоккейный слот ночи.",
  },
  {
    home: /anaheim|ducks|анахайм/i,
    away: /edmonton|oilers|ойлерз|эдмонтон/i,
    market: "Исход",
    pick: "П2",
    oddsHint: "~1.70–1.90",
    confidence: 3,
    risk: "medium",
    rationale:
      "НХЛ, 05:00 МСК. Ойлерз 2-0-1 в гостях (−130), Дакс тоже 2-0-0. Узкая гипотеза на Эдмонтон, не железо: Анахайм пока без поражений в основное.",
  },
  {
    home: /dream|дрим/i,
    away: /liberty|либерти/i,
    market: "Фора",
    pick: "Дрим −1.5",
    oddsHint: "~1.80–2.00",
    confidence: 4,
    risk: "medium",
    rationale:
      "WNBA плей-офф, 02:30 МСК. Атланта 30-14 дома против Либерти 26-18. Линия почти равная (−122 на хозяек), поэтому не голый П1 — фора Дрим −1.5.",
  },
  {
    home: /valkyries|валькир/i,
    away: /aces|эйсез/i,
    market: "Тотал",
    pick: "ТМ 160.5",
    oddsHint: "~1.80–2.00",
    confidence: 3,
    risk: "low",
    rationale:
      "WNBA плей-офф, 04:30 МСК. Валькирии 32-12 дома, Эйсез 31-13. Исход почти монета, тотал уже 156.5 — серия рисуется закрытой. Спокойнее низ, чем П1.",
  },
  {
    home: /france|франц/i,
    away: /belgium|бельг/i,
    market: "Двойной шанс",
    pick: "1X",
    oddsHint: "~1.20–1.35",
    confidence: 4,
    risk: "low",
    rationale:
      "Лига наций, 21:45 МСК. Франция дома (2-1-0), Бельгия в гостях тоже в порядке (2-0-1). Голый П1 уже короткий (~1.45) — спокойнее 1X: не проиграть дома важнее, чем продавить минус.",
  },
  {
    home: /italy|итал/i,
    away: /t[uü]rk|турц/i,
    market: "Исход",
    pick: "П1",
    oddsHint: "~1.40–1.55",
    confidence: 4,
    risk: "low",
    rationale:
      "Лига наций, 21:45 МСК. Италия дома, Турция без очков в группе (0-0-3, форма LLLWL). Прямой П1, без форы −1.5 — турки могут удержать счёт, но победа гостей маловероятна.",
  },
  {
    home: /montenegro|черногор/i,
    away: /armenia|армен/i,
    market: "Исход",
    pick: "П1",
    oddsHint: "~1.35–1.50",
    confidence: 4,
    risk: "low",
    rationale:
      "Лига наций, 21:45 МСК. Черногория 3-0-0 (WWWDW) против Армении 1-0-2. Домашний фаворит группы — самый прямой исход слота.",
  },
  {
    home: /romania|румын/i,
    away: /sweden|швец/i,
    market: "Двойной шанс",
    pick: "X2",
    oddsHint: "~1.25–1.40",
    confidence: 4,
    risk: "low",
    rationale:
      "Лига наций, 21:45 МСК. Румыния 0-0-3, Швеция 2-1-0. Голый П2 ~1.80 ещё рабочий, но спокойнее X2: гости сильнее по группе, домашний срыв румын не обязан быть в одну калитку.",
  },
  {
    home: /northern ireland|северн/i,
    away: /georgia|груз/i,
    market: "Тотал",
    pick: "ТМ 2.5",
    oddsHint: "~1.55–1.80",
    confidence: 3,
    risk: "low",
    rationale:
      "Лига наций, 21:45 МСК. Линия тотала уже около 1.5 — матч рисуют закрытым. Северная Ирландия дома 2-1-0, Грузия 0-1-2 в гостях. ТМ 2.5 спокойнее, чем исход.",
  },
  {
    home: /bosnia|босн/i,
    away: /poland|польш/i,
    market: "Двойной шанс",
    pick: "12",
    oddsHint: "~1.30–1.45",
    confidence: 3,
    risk: "medium",
    rationale:
      "Лига наций, 21:45 МСК. Босния дома 1-2-0, Польша 1-1-1. Линия почти паритет, ничья не дешёвая. Если брать — победа любой, не исход фаворита.",
  },
  {
    home: /mystics|мистикс/i,
    away: /dream|дрим/i,
    market: "Фора",
    pick: "Дрим −1.5",
    oddsHint: "~1.85–2.05",
    confidence: 4,
    risk: "medium",
    rationale:
      "WNBA плей-офф: Дрим чуть ровнее по сезону (30-14 против 28-16). Мистикс дома, поэтому не голый П2 — фора гостей −1.5.",
  },
  {
    home: /wings|уингз/i,
    away: /valkyries|валькир/i,
    market: "Исход",
    pick: "П2",
    oddsHint: "~1.70–1.95",
    confidence: 4,
    risk: "medium",
    rationale:
      "WNBA плей-офф: Валькирии лучшие по сезону (32-12), Уингз слабее. Гости, без лишней форы.",
  },
  {
    home: /aces|эйсез/i,
    away: /fever|фивер/i,
    market: "Исход",
    pick: "П1",
    oddsHint: "~1.55–1.80",
    confidence: 3,
    risk: "low",
    rationale:
      "WNBA плей-офф: Эйсез дома против Фивер. Класс и площадка за Лас-Вегас — самый прямой исход слота.",
  },
  {
    home: /munar/i,
    away: /fritz/i,
    market: "Победитель",
    pick: "Fritz",
    oddsHint: "~1.25–1.45",
    confidence: 4,
    risk: "low",
    rationale:
      "ATP Токио: Фриц заметно выше Munar по классу и стабильности. Коэффициент часто уже короткий — идея только если линия ещё не выжжена.",
  },
  {
    home: /fritz/i,
    away: /munar/i,
    market: "Победитель",
    pick: "Fritz",
    oddsHint: "~1.25–1.45",
    confidence: 4,
    risk: "low",
    rationale:
      "ATP Токио: Фриц выше классом, чем Munar. Смотреть победителя, не «сеты» — фаворит часто уже сжат.",
  },
  {
    home: /ruud/i,
    away: /darderi/i,
    market: "Победитель",
    pick: "Ruud",
    oddsHint: "~1.30–1.55",
    confidence: 4,
    risk: "low",
    rationale:
      "ATP Токио: Рууд стабильнее Darderi на харде. Прямая гипотеза на победителя, если коэффициент ещё дышит.",
  },
  {
    home: /darderi/i,
    away: /ruud/i,
    market: "Победитель",
    pick: "Ruud",
    oddsHint: "~1.30–1.55",
    confidence: 4,
    risk: "low",
    rationale:
      "ATP Токио: Рууд выше Darderi по сезону. Рабочая линия — победитель, не тотал геймов.",
  },
  {
    home: /michelsen/i,
    away: /alcaraz/i,
    market: "Победитель",
    pick: "Alcaraz",
    oddsHint: "~1.15–1.35",
    confidence: 5,
    risk: "low",
    rationale:
      "ATP Токио: Алькарас против Michelsen — явный класс. Имеет смысл только если коэффициент не уже «мёртвый».",
  },
  {
    home: /alcaraz/i,
    away: /michelsen/i,
    market: "Победитель",
    pick: "Alcaraz",
    oddsHint: "~1.15–1.35",
    confidence: 5,
    risk: "low",
    rationale:
      "ATP Токио: Алькарас выше классом. Победитель, без экзотики по сетам.",
  },
  {
    home: /norrie/i,
    away: /zverev/i,
    market: "Победитель",
    pick: "Zverev",
    oddsHint: "~1.25–1.50",
    confidence: 4,
    risk: "low",
    rationale:
      "ATP Пекин: Зверев выше Norrie. Классическая гипотеза на фаворита 500-ки.",
  },
  {
    home: /zverev/i,
    away: /norrie/i,
    market: "Победитель",
    pick: "Zverev",
    oddsHint: "~1.25–1.50",
    confidence: 4,
    risk: "low",
    rationale:
      "ATP Пекин: Зверев предпочтительнее Norrie по классу. Победитель, если линия не выжжена.",
  },
  {
    home: /rublev|рублёв|рублев/i,
    away: /griekspoor/i,
    market: "Победитель",
    pick: "Rublev",
    oddsHint: "~1.40–1.70",
    confidence: 3,
    risk: "medium",
    rationale:
      "ATP Пекин: Рублёв чуть выше Griekspoor, но это уже не каток. Узкая гипотеза на победителя.",
  },
  {
    home: /griekspoor/i,
    away: /rublev|рублёв|рублев/i,
    market: "Победитель",
    pick: "Rublev",
    oddsHint: "~1.40–1.70",
    confidence: 3,
    risk: "medium",
    rationale:
      "ATP Пекин: Рублёв предпочтительнее Griekspoor. Не «железо», но чище, чем 125-ки.",
  },
  {
    home: /tsitsipas|циципас/i,
    away: /etcheverry/i,
    market: "Победитель",
    pick: "Tsitsipas",
    oddsHint: "~1.35–1.65",
    confidence: 3,
    risk: "medium",
    rationale:
      "ATP Токио: Циципас выше Etcheverry. Хард ему привычнее — победитель, без разгона по сетам.",
  },
  {
    home: /etcheverry/i,
    away: /tsitsipas|циципас/i,
    market: "Победитель",
    pick: "Tsitsipas",
    oddsHint: "~1.35–1.65",
    confidence: 3,
    risk: "medium",
    rationale:
      "ATP Токио: Циципас класссом выше Etcheverry. Рабочая идея — победитель.",
  },
  {
    home: /navone/i,
    away: /de minaur|deminaur/i,
    market: "Победитель",
    pick: "de Minaur",
    oddsHint: "~1.25–1.50",
    confidence: 4,
    risk: "low",
    rationale:
      "ATP Пекин: де Минор заметно стабильнее Navone на харде. Победитель фаворита.",
  },
  {
    home: /de minaur|deminaur/i,
    away: /navone/i,
    market: "Победитель",
    pick: "de Minaur",
    oddsHint: "~1.25–1.50",
    confidence: 4,
    risk: "low",
    rationale:
      "ATP Пекин: де Минор выше Navone. Прямая линия на победителя.",
  },
  {
    home: /jacquet/i,
    away: /rune/i,
    market: "Победитель",
    pick: "Rune",
    oddsHint: "~1.20–1.40",
    confidence: 4,
    risk: "low",
    rationale:
      "ATP Токио: Руне выше Jacquet. Если коэффициент ещё не 1.10 — рабочий фаворит слота.",
  },
  {
    home: /rune/i,
    away: /jacquet/i,
    market: "Победитель",
    pick: "Rune",
    oddsHint: "~1.20–1.40",
    confidence: 4,
    risk: "low",
    rationale:
      "ATP Токио: Руне выше классом. Победитель, без экзотики.",
  },
  {
    home: /kasatkina|касаткина/i,
    away: /badosa|бадоса/i,
    market: "Победитель",
    pick: "Badosa",
    oddsHint: "~1.70–2.05",
    confidence: 3,
    risk: "medium",
    rationale:
      "WTA Пекин: Бадоса чуть выше Касаткиной по удару, но это равный слот. Узкая гипотеза, не каток.",
  },
  {
    home: /badosa|бадоса/i,
    away: /kasatkina|касаткина/i,
    market: "Победитель",
    pick: "Badosa",
    oddsHint: "~1.70–2.05",
    confidence: 3,
    risk: "medium",
    rationale:
      "WTA Пекин: Бадоса предпочтительнее Касаткиной. Равный матч — только если линия около двух.",
  },
  {
    home: /italy|италия/i,
    away: /belgium|бельгия/i,
    market: "Обе забьют",
    pick: "Да",
    oddsHint: "~1.70–1.95",
    confidence: 4,
    risk: "medium",
    rationale:
      "Лига наций, Италия — Бельгия: оба умеют открывать матч, сухой исход здесь менее чистый. Рабочая гипотеза — обе забьют.",
  },
  {
    home: /turkey|türkiye|turkiye|турция/i,
    away: /france|франция/i,
    market: "Исход",
    pick: "П2",
    oddsHint: "~1.70–2.00",
    confidence: 4,
    risk: "medium",
    rationale:
      "Франция выше классом, даже в гостях у Турции. В Лиге наций это одна из самых читаемых линий слота — гости, без лишней форы.",
  },
  {
    home: /hungary|венгрия/i,
    away: /ukraine|украина/i,
    market: "Обе забьют",
    pick: "Да",
    oddsHint: "~1.75–2.00",
    confidence: 3,
    risk: "medium",
    rationale:
      "Венгрия дома живая, Украина в последних играх забивает. Исход 1X2 шумный — спокойнее обе забьют.",
  },
  {
    home: /poland|польша/i,
    away: /bosnia|босния/i,
    market: "Исход",
    pick: "П1",
    oddsHint: "~1.65–1.90",
    confidence: 3,
    risk: "medium",
    rationale:
      "Польша дома против Боснии в Лиге наций. Не каток, но хозяева здесь прямее, чем тотал.",
  },
  {
    home: /england|англия/i,
    away: /spain|испания/i,
    market: "Обе забьют",
    pick: "Да",
    oddsHint: "~1.65–1.90",
    confidence: 4,
    risk: "medium",
    rationale:
      "Англия — Испания, Лига наций. Испания на серии, хозяева дома тоже открытые. Голый исход слишком тонкий — обе забьют чище.",
  },
  {
    home: /czechia|czech|чехия/i,
    away: /croatia|хорватия/i,
    market: "Исход",
    pick: "П2",
    oddsHint: "~1.80–2.15",
    confidence: 3,
    risk: "medium",
    rationale:
      "Хорватия стабильнее по отрезку. В гостях у Чехии не разгром, но исход гостей читается лучше форы.",
  },
  {
    home: /macedonia|македония/i,
    away: /switzerland|швейцария/i,
    market: "Фора",
    pick: "Швейцария −1",
    oddsHint: "~1.70–1.95",
    confidence: 4,
    risk: "low",
    rationale:
      "Швейцария на серии, Македония дома проседает. П2 часто уже короткий — рабочая линия фора гостей −1.",
  },
  {
    home: /germany|германия/i,
    away: /greece|греция/i,
    market: "Исход",
    pick: "П1",
    oddsHint: "~1.40–1.65",
    confidence: 4,
    risk: "low",
    rationale:
      "Германия дома против Греции в Лиге наций. Класс и площадка за хозяев; если коэффициент слишком сжат, лучше смотреть фору.",
  },
  {
    home: /serbia|сербия/i,
    away: /netherlands|нидерланды/i,
    market: "Исход",
    pick: "П2",
    oddsHint: "~1.75–2.05",
    confidence: 3,
    risk: "medium",
    rationale:
      "Нидерланды выше классом, даже в Белграде. Не «каток», но если брать исход — гости.",
  },
  {
    home: /norway|норвегия/i,
    away: /portugal|португалия/i,
    market: "Исход",
    pick: "П2",
    oddsHint: "~1.85–2.20",
    confidence: 3,
    risk: "medium",
    rationale:
      "Португалия в гостях у Норвегии — острее, чем домашний слот. Класс всё ещё за гостей, это не железная фора.",
  },
  {
    home: /belgium|бельгия/i,
    away: /france|франция/i,
    market: "Исход",
    pick: "П2",
    oddsHint: "~1.80–2.15",
    confidence: 3,
    risk: "medium",
    rationale:
      "Повтор Лиги наций: Франция чуть свежее по отрезку. Голый П2, без разгона форы.",
  },
  {
    home: /barcelona|барселона/i,
    away: /racing|расинг/i,
    market: "Фора",
    pick: "Барселона −1.5",
    oddsHint: "~1.70–1.95",
    confidence: 5,
    risk: "low",
    rationale:
      "Барселона идёт 5 из 5 в лиге, Расинг — только что поднявшийся середняк с рваной формой. Исход хозяев часто уже слишком короткий; рабочая линия — фора −1.5.",
  },
  {
    home: /levante|леванте/i,
    away: /athletic|атлетик/i,
    market: "Фора",
    pick: "Атлетик 0",
    oddsHint: "~1.75–2.00",
    confidence: 3,
    risk: "medium",
    rationale:
      "Атлетик свежее по отрезку, Леванте дома спотыкается. Голый П2 в Валенсии острый — спокойнее фора гостей 0: ничья возвращает, победа Бильбао заносит.",
  },
  {
    home: /milan|милан/i,
    away: /benfica|бенфика/i,
    market: "Тотал",
    pick: "ТБ 2.5",
    oddsHint: "~1.80–2.05",
    confidence: 4,
    risk: "medium",
    rationale:
      "Бенфика едет на серии побед, Милан дома открытый. В ЛЕ такой класс редко уходит в ноль: тотал 2.5 чище, чем угадывать, кто заберёт исход.",
  },
  {
    home: /leverkusen|байер|леверкузен/i,
    away: /celje|целе/i,
    market: "Фора",
    pick: "Leverkusen −1.5",
    oddsHint: "~1.65–1.90",
    confidence: 4,
    risk: "low",
    rationale:
      "Разрыв класса в ЛЕ слишком большой: Байер должен контролировать темп, Целе не держит такой уровень. Фора −1.5 информативнее голого П1.",
  },
  {
    home: /anderlecht|андерлехт/i,
    away: /lyon|лион/i,
    market: "Исход",
    pick: "П2",
    oddsHint: "~1.85–2.20",
    confidence: 3,
    risk: "medium",
    rationale:
      "Лион выше классом, даже в гостях у Андерлехта. Не «каток», но если брать исход — гости, а не домашний П1 по короткой форме хозяев.",
  },
  {
    home: /sunderland|сандерленд/i,
    away: /\baz\b|алкмар/i,
    market: "Исход",
    pick: "П2",
    oddsHint: "~1.90–2.25",
    confidence: 3,
    risk: "medium",
    rationale:
      "AZ стабильнее по отрезку, Сандерленд в еврокубке ещё сырой. Гостевой исход не короткий, зато понятнее, чем тотал без состава.",
  },
  {
    home: /orenburg|оренбург|газовик/i,
    away: /krasnodar|краснодар/i,
    market: "Исход",
    pick: "П2",
    oddsHint: "~1.55–1.80",
    confidence: 4,
    risk: "low",
    rationale:
      "Краснодар — лидер с серией без поражений, Оренбург топчется внизу и почти не выигрывает. Домашний слот хозяев здесь слабый аргумент против класса гостей.",
  },
  {
    home: /rostov|ростов/i,
    away: /dinamo moscow|dynamo moscow|динамо/i,
    market: "Исход",
    pick: "П2",
    oddsHint: "~1.80–2.10",
    confidence: 4,
    risk: "medium",
    rationale:
      "Динамо едет на победной серии, Ростов проседает. В РПЛ это одна из самых читаемых линий ближайших суток — гости, без лишней форы.",
  },
  {
    home: /makhachkala|махачкала/i,
    away: /cska|цска/i,
    market: "Фора",
    pick: "ЦСКА 0",
    oddsHint: "~1.70–1.95",
    confidence: 3,
    risk: "medium",
    rationale:
      "ЦСКА стабильнее, но Махачкала дома неудобная. П2 голый может не зайти из‑за ничьей — фора 0 на армейцев закрывает этот сценарий.",
  },
  {
    home: /betis|бетис/i,
    away: /getafe|хетафе/i,
    market: "Исход",
    pick: "П1",
    oddsHint: "~1.70–1.95",
    confidence: 4,
    risk: "medium",
    rationale:
      "Бетис дома в ударе, Хетафе тяжело забивает. Если не лезть в тотал, хозяева — самая прямая гипотеза на этот слот Ла Лиги.",
  },
  {
    home: /bayern|байерн/i,
    away: /union berlin|унион/i,
    market: "Фора",
    pick: "Бавария −1.5",
    oddsHint: "~1.55–1.80",
    confidence: 4,
    risk: "low",
    rationale:
      "Бавария дома против Униона, который ещё не набрал ход. П1 почти наверняка уже выжжен — смотреть фору −1.5.",
  },
  {
    home: /monaco|монако/i,
    away: /lens|ланс/i,
    market: "Исход",
    pick: "П1",
    oddsHint: "~1.65–1.90",
    confidence: 3,
    risk: "medium",
    rationale:
      "Монако дома на серии, Ланс играет рвано. Не разгромная история, но исход хозяев здесь чище, чем тотал.",
  },
  {
    home: /brentford|брентфорд/i,
    away: /chelsea|челси/i,
    market: "Тотал",
    pick: "ТБ 2.5",
    oddsHint: "~1.75–2.00",
    confidence: 3,
    risk: "medium",
    rationale:
      "Челси в гостях нестабилен, Брентфорд дома всегда открывает матч. Исход гостей ненадёжен — рабочее поле тотал 2.5.",
  },
  {
    home: /olympiacos|олимпиакос/i,
    away: /jagiellonia|ягеллония/i,
    market: "Исход",
    pick: "П1",
    oddsHint: "~1.50–1.75",
    confidence: 3,
    risk: "low",
    rationale:
      "Олимпиакос дома в еврокубке обычно контролирует такие пары. Ягеллония живая, но класс и площадка всё ещё за хозяев.",
  },
];

function sideHits(side: MatchEvent["home"], re: RegExp): boolean {
  return re.test(side.name) || re.test(side.short);
}

export function handTips(events: MatchEvent[]): Tip[] {
  const drafts: Array<{
    eventId: string;
    market: string;
    pick: string;
    oddsHint: string;
    confidence: 1 | 2 | 3 | 4 | 5;
    risk: Risk;
    rationale: string;
  }> = [];
  for (const event of events) {
    if (event.state !== "pre") continue;
    const hit = HAND.find((row) => sideHits(event.home, row.home) && sideHits(event.away, row.away));
    if (!hit) continue;
    drafts.push({
      eventId: event.id,
      market: hit.market,
      pick: hit.pick,
      oddsHint: hit.oddsHint,
      confidence: hit.confidence,
      risk: hit.risk,
      rationale: hit.rationale,
    });
  }
  return applyAuthored(events, drafts);
}
