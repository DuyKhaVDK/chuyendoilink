const axios = require('axios');

// === LOGIC XỬ LÝ (GIỮ NGUYÊN TỪ CŨ) ===
function cleanUrlLogic(fullUrl) {
    try {
        const urlObj = new URL(fullUrl);
        const path = urlObj.pathname;

        const isEventPage = path.startsWith('/m/');
        const isProductPage = path.startsWith('/product/');
        const isShopPage = /^\/[^\/]+$/.test(path) && !path.startsWith('/search') && !path.startsWith('/cart');

        if (isEventPage || isProductPage || isShopPage) {
            return urlObj.origin + path; 
        }

        if (fullUrl.includes('&uls_trackid')) {
            return fullUrl.split('&uls_trackid')[0];
        }
        return fullUrl;
    } catch (e) {
        return fullUrl;
    }
}

async function convertOneLink(url) {
    if (!url.includes('shopee') && !url.includes('shp.ee')) return url;
    try {
        const response = await axios.get(url, {
            maxRedirects: 5,
            validateStatus: status => status >= 200 && status < 400
        });
        const fullUrl = response.request.res.responseUrl || url;
        return cleanUrlLogic(fullUrl);
    } catch (error) {
        return url; 
    }
}

// === CẤU TRÚC SERVERLESS CỦA NETLIFY ===
exports.handler = async function(event, context) {
    // Chỉ chấp nhận POST
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body);
        const text = body.text;

        if (!text) return { statusCode: 400, body: JSON.stringify({ error: 'No text provided' }) };

        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const matches = text.match(urlRegex) || [];

        if (matches.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ resultText: text })
            };
        }

        const uniqueUrls = [...new Set(matches)];
        const conversions = await Promise.all(
            uniqueUrls.map(async (url) => {
                const clean = await convertOneLink(url);
                return { original: url, clean: clean };
            })
        );

        let resultText = text;
        conversions.forEach(item => {
            resultText = resultText.split(item.original).join(item.clean);
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ resultText })
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Error' })
        };
    }
};