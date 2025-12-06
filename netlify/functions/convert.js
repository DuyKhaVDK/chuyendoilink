const axios = require('axios');

// === LOGIC XỬ LÝ ===
function cleanUrlLogic(fullUrl) {
    try {
        const urlObj = new URL(fullUrl);
        const path = urlObj.pathname; // Lấy phần đường dẫn

        // --- NHÓM 1: CÁC DẠNG CẦN LẤY LINK GỐC SẠCH & BIẾN ĐỔI ---

        // 1. [MỚI] Link dạng: /Tên-Shop/ShopID/ProductID
        // Ví dụ: /opaanlp/267075185/9253405547
        // Logic: Bắt lấy ShopID và ProductID, sau đó ép về dạng /product/...
        // Regex giải thích: 
        // ^\/([^\/]+) -> Bắt nhóm 1: Tên Shop (opaanlp)
        // \/(\d+)     -> Bắt nhóm 2: Shop ID (267075185)
        // \/(\d+)$    -> Bắt nhóm 3: Product ID (9253405547)
        const universalMatch = path.match(/^\/([^\/]+)\/(\d+)\/(\d+)$/);
        
        if (universalMatch) {
            const shopId = universalMatch[2];     // Lấy Shop ID
            const productId = universalMatch[3];  // Lấy Product ID
            // Trả về link chuẩn hóa: https://shopee.vn/product/ShopID/ProductID
            return `${urlObj.origin}/product/${shopId}/${productId}`;
        }

        // 2. Link sự kiện (bắt đầu bằng /m/) -> Giữ nguyên, bỏ tham số
        if (path.startsWith('/m/')) {
            return urlObj.origin + path;
        }

        // 3. Link sản phẩm chuẩn cũ (/product/) -> Giữ nguyên, bỏ tham số
        // (Trường hợp này thực ra Regex ở mục 1 đã bao phủ, nhưng để riêng cho chắc chắn)
        if (path.startsWith('/product/')) {
            return urlObj.origin + path;
        }

        // 4. Link Shop (Chỉ có 1 cấp: /ten-shop) -> Giữ nguyên, bỏ tham số
        const isShopPage = /^\/[^\/]+$/.test(path) && !path.startsWith('/search') && !path.startsWith('/cart');
        if (isShopPage) {
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

// === HANDLER CỦA NETLIFY (không đổi) ===
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
