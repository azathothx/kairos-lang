# Kairos ロゴ・アイコン

K モノグラムと `|>` アイコンの**二部品ファミリー**——どちらも「縦棒＋山形」の同じ二部品で、
向きを変えると K（`|<` の骨格）にも本体層の結合子 `|>` にもなる。プレートは「好機の金」
（light `#A9701F` / dark `#D9A44B`）、白抜きは透過。

| ファイル | 内容 |
| --- | --- |
| `kairos-mark.svg` | K モノグラム（金プレート・dark 対応の media query 内蔵）。favicon・README の正 |
| `kairos-pipe.svg` | `\|>` アイコン（同上） |
| `kairos-mark-mono.svg` / `kairos-pipe-mono.svg` | 単色版（`currentColor`）。インライン埋め込みで文字色に追従 |
| `favicon-32.png` / `apple-touch-icon.png` | ラスタのフォールバック（マスターから生成） |
| `social-preview.svg` / `.png` | GitHub ソーシャルプレビュー 1280×640（SVG が原版・フォントは Ubuntu / Ubuntu Mono。反映は Settings → Social preview へ手動アップロード） |

使用の作法: **うるさくならない程度に**——現在の使用箇所は、K モノグラム＝README（英日）の見出し・
Pages の favicon・Pages パンくずの 3 箇所、`|>` アイコン＝記述語リファレンスの扉（英日 H1）と
演算子族マップ図（`assets/figures/operator-map*.svg` の視覚アンカー）の 2 箇所（2026-07-24 初使用。
どちらも「`|>`＝合成」という文脈が立つ場所——仕様の扉は K・演算子の扉は `|>` の対称）。
`|>` アイコンは飾りとして乱発せず、この基準を守る。

ラスタの再生成（sharp・依存はリポジトリ外で可）:

```js
sharp('kairos-mark.svg', { density: 300 }).resize(32, 32).png().toFile('favicon-32.png')
sharp('kairos-mark.svg', { density: 300 }).resize(180, 180)
  .flatten({ background: '#FBFAF8' }).png().toFile('apple-touch-icon.png')
```
