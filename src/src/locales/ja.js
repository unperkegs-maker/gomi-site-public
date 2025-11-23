export default {
    title: 'ごみ分別データベース',
    subtitle: 'スマホ優先。表は「都道府県 / 市区町村 / 品名 / 分別」＋詳細はポップアップ。',
    labels: {
        prefecture: '都道府県',
        city: '市区町村',
        category: 'カテゴリ',
        keyword: 'キーワード',
        display: '表示',
        perPage: '件数',
        conflict: '情報が一致しません',
    },
    placeholders: {
        city: '例：横浜市 / 大阪市 / 札幌…',
        keyword: '品名・注記・出し方など',
    },
    actions: {
        search: '検索',
        reset: 'リセット',
        details: '詳細を表示',
        copyLink: '検索条件のリンクをコピー',
        prev: '前へ',
        next: '次へ',
    },
    table: {
        prefecture: '都道府県',
        municipality: '市区町村',
        item: '品名',
        category: 'カテゴリ',
    },
    detail: {
        prefecture: '都道府県',
        city: '市区町村',
        item: '品名',
        categories: 'カテゴリ',
        instructions: '出し方・注記',
        sources: '情報源URL',
    },
};
