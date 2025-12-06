const axios = require('axios');

// === LOGIC XỬ LÝ ===
function cleanUrlLogic(fullUrl) {
    try {
        const urlObj = new URL(fullUrl);
        const path = urlObj.pathname; // Lấy phần đường dẫn

        // --- NHÓM 1: CÁC DẠNG CẦN LẤY LINK GỐC SẠCH (Xóa hết tham số ?...) ---

        // 1. Link sự kiện (bắt đầu bằng /m/)
        const isEventPage = path.startsWith('/m/');

        // 2. Link sản phẩm chuẩn (/product/...)
        const isProductPage = path.startsWith('/product/');

        // 3. Link Shop (Chỉ có 1 cấp: /ten-shop)
        const isShopPage = /^\/[^\/]+$/.test(path) && !path.startsWith('/search') && !path.startsWith('/cart');

        // 4. [BỔ SUNG] Link sản phẩm dạng: /Tên-Shop/ShopID/ProductID
        // Ví dụ: /opaanlp/267075185/9253405547
        // Regex giải thích: Bắt đầu bằng / -> Chữ bất kỳ -> / -> Số -> / -> Số
        const isUniversalLink = /^\/[^\/]+\/\d+\/\d+$/.test(path);

        // NẾU THUỘC 1 TRONG 4 DẠNG TRÊN -> XÓA SẠCH THAM SỐ
        if (isEventPage || isProductPage || isShopPage || isUniversalLink) {
            return urlObj.origin + path; 
        }

        // --- NHÓM 2: CÁC DẠNG CÒN LẠI (GIỮ NGUYÊN TẮC CŨ) ---
        // Giữ lại tham số đầu (mmp_pid...), chỉ cắt từ &uls_trackid trở về sau
        if (fullUrl.includes('&uls_trackid')) {
            return fullUrl.split('&uls_trackid')[0];
        }

        // Nếu không dính trường hợp nào thì trả về nguyên bản
        return fullUrl;

    } catch (e) {
        return fullUrl;
    }
}

// Hàm gọi request lấy link (không đổi)
async function convertOneLink(url) {
    // Chỉ xử lý link shopee
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

// === HANDLER CỦA NETLIFY ===
exports.handler = async function(event, context) {
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
