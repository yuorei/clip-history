# Clip History

## 起動のしかた

依存関係をインストールします。

```sh
npm install
```

デスクトップアプリを開発用に起動します。

```sh
npm run dev
```

TUIを起動します。

```sh
npm run tui
```

LinuxでTUIからクリップボードへコピーする場合は、環境に合わせて `wl-clipboard`、`xclip`、`xsel` のいずれかを入れておきます。

TUIでは `j/k` または矢印キーで移動、`g/G` で先頭/末尾へ移動、`/` で検索、`enter` でコピーして終了、`r` で再読み込み、`q` で終了できます。

macOS向けのデスクトップアプリを作成します。

```sh
npm run dist
open desktop/dist/mac-arm64/Clip\ History.app
```

## 開発のしかた

デスクトップアプリのコードは `desktop/` にあります。

```sh
npm run dev -w desktop
npm run build -w desktop
npm run dist -w desktop
```

TUIのコードは `tui/` にあります。

```sh
npm run dev -w tui
npm run build -w tui
```

TUIが読む履歴JSONは、macOSでは `~/Library/Application Support/clip-history/clipboard-history.json`、Linuxでは `${XDG_CONFIG_HOME:-~/.config}/clip-history/clipboard-history.json` です。別の場所を読む場合は `CLIP_HISTORY_PATH` を指定します。

全体をビルドする場合は次のコマンドを使います。

```sh
npm run build
```
