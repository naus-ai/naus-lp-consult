// 無料相談の予約の設定値(ここだけを書き換えれば、空き枠の出し方が変わる)
// 時刻はすべて日本時間(Asia/Tokyo)で考える
export const BOOKING = {
  timeZone: 'Asia/Tokyo',
  utcOffsetMinutes: 9 * 60, // 日本時間はUTC+9(夏時間なし)
  slotMinutes: 30,          // 1枠の長さ(分)
  stepMinutes: 30,          // 枠の刻み(分)
  dayStart: '10:00',        // 受付開始(最初の枠の開始時刻)
  dayEnd: '19:00',          // 受付終了(最後の枠はこの時刻に終わる=18:30〜19:00)
  weekdays: [1, 2, 3, 4, 5], // 受付する曜日(0=日 1=月 … 6=土)。祝日は別途除外
  bufferMinutes: 15,        // 既存の予定の前後に空ける時間(分)
  minLeadHours: 12,         // 枠の開始時刻の何時間前で締め切るか
  maxDaysAhead: 14,         // 今日から何日後の日付まで予約できるか
  // 祝日の判定に使う、Google公開の「日本の祝日」カレンダー
  holidayCalendarId: 'ja.japanese#holiday@group.v.calendar.google.com',
};

// LPごとの予定タイトル。{company}{name} に入力値が入る
export const TITLES = {
  consult: '【ゼロからAI Academy無料相談】{company} {name}様',
  shigyo: '【ゼロからAI Academy無料相談】{company} {name}様',
};

// 予定の説明欄で、会社名の項目名
export const COMPANY_LABELS = {
  consult: '会社名',
  shigyo: '事務所名',
};
