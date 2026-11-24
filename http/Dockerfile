# kairos-lang-http のイメージ（評価器は lock の kairos-lang・実行時依存はそれだけ）。dist は事前に npm run build で作る。
# ベース像は digest で固定（同じタグの再ビルドで中身が変わらない＝2026-10-31 セキュリティレビュー所見 8）。更新は依存の自動更新の PR で受ける。
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist ./dist
USER node
ENV PORT=8080
EXPOSE 8080
# PORT を変えても死活が見える（shell 形式で $PORT を展開）。評価は worker スレッドなので評価中も /healthz は返る
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "dist/bin.js"]
