# Clip History

## 起動のしかた

依存関係をインストールします。

```sh
npm install
```

開発用にアプリを起動します。

```sh
npm run dev
```

ビルド済みのアプリを起動する場合は、先にビルドしてから起動します。

```sh
npm run build
npm start
```

## 開発のしかた

通常の開発では次のコマンドを使います。

```sh
npm run dev
```

このコマンドで Vite の開発サーバーと Electron が同時に起動します。

配布用のビルドを確認する場合は次のコマンドを使います。

```sh
npm run build
```

macOS 向けのアプリ出力を作る場合は次のコマンドを使います。

```sh
npm run dist
```
