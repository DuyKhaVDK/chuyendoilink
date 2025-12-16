const axios = require('axios');
const crypto = require('crypto');

// --- CẤU HÌNH TÀI KHOẢN SHOPEE CỦA BẠN ---
// Thay thế bằng thông tin thật của bạn
const SHOPEE_APP_ID = "17301060084"; 
const SHOPEE_SECRET = "2OI7GNRRDK7VDMZRU3AYQ7RPPAPN4VBK"; 

// === 1. LOGIC LÀM SẠCH LINK (GIỮ NGUYÊN) ===
function cleanUrlLogic(fullUrl) {
    try {
        const urlObj = new URL(fullUrl);
        const path = urlObj.pathname;

        // Xử lý link Universal: /ShopName/ShopID/ProductID
        const universalMatch = path.match(/^\/([^\/]+)\/(\d+)\/(\d+)$/);
        if (universalMatch) {
            return `${urlObj.origin}/product/${universalMatch[2]}/${universalMatch[3]}`;
        }
        
        // Xử lý các dạng link khác (/m/, /product/, Shop)
        if (path.startsWith('/m/') || path.startsWith('/product/') || (/^\/[^\/]+$/.test(path) && !path.startsWith('/search'))) {
            return urlObj.origin + path; 
        }
        
        // Link thường: Chỉ cắt tracking
        if (fullUrl.includes('&uls_trackid')) {
            return fullUrl.split('&uls_trackid')[0];
        }
        return fullUrl;
    } catch (e) {
        return fullUrl;
    }
}

// === 2. LOGIC GỌI API SHOPEE (MỚI - THEO TÀI LIỆU BẠN GỬI) ===
async function generateAffiliateLink(cleanUrl) {
    // Nếu chưa điền key thì trả về null
    if (!SHOPEE_APP_ID || !SHOPEE_SECRET || SHOPEE_APP_ID.includes("DIEN_APP_ID")) return null;

    try {
        const urlEndpoint = 'https://open-api.affiliate.shopee.vn/graphql';
        const timestamp = Math.floor(Date.now() / 1000); // Thời gian hiện tại (giây)

        // 1. Tạo Payload (Body request) chuẩn JSON
        // Lưu ý: Cần escape dấu ngoặc kép bên trong chuỗi query
        const payloadObj = {
            query: `mutation {
                generateShortLink(input: { originUrl: "${cleanUrl}", subIds: ["tool_convert"] }) {
                    shortLink
                }
            }`
        };
        const payloadString = JSON.stringify(payloadObj);

        // 2. Tạo chuỗi để mã hóa (Signature Factor)
        // Công thức: AppId + Timestamp + Payload + Secret
        const signatureFactor = SHOPEE_APP_ID + timestamp + payloadString + SHOPEE_SECRET;

        // 3. Tính toán Signature bằng SHA256
        const signature = crypto.createHash('sha256').update(signatureFactor).digest('hex');

        // 4. Tạo Header xác thực
        const authHeader = `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`;

        // 5. Gửi Request
        const response = await axios.post(urlEndpoint, payloadString, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });

        // 6. Lấy kết quả
        if (response.data.errors) {
            console.error("Shopee API Error:", JSON.stringify(response.data.errors));
            return null;
        }

        return response.data.data.generateShortLink.shortLink;

    } catch (error) {
        console.error("Lỗi kết nối Shopee:", error.response ? error.response.data : error.message);
        return null;
    }
}

async function convertOneLink(url) {
    if (!url.includes('shopee') && !url.includes('shp.ee')) return { clean: url, affiliate: null };

    try {
        // Lấy link gốc từ link rút gọn
        const response = await axios.get(url, {
            maxRedirects: 5,
            validateStatus: status => status >= 200 && status < 400
        });
        const fullUrl = response.request.res.responseUrl || url;
        
        // Bước 1: Làm sạch link
        const clean = cleanUrlLogic(fullUrl);
        
        // Bước 2: Chuyển thành link Affiliate
        const affiliate = await generateAffiliateLink(clean);

        return { clean: clean, affiliate: affiliate };

    } catch (error) {
        return { clean: url, affiliate: null }; 
    }
}

// === 3. HANDLER CHO NETLIFY ===
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

        if (matches.length === 0) return { statusCode: 200, body: JSON.stringify({ resultText: text }) };

        const uniqueUrls = [...new Set(matches)];
        
        // Xử lý song song tất cả các link
        const conversions = await Promise.all(
            uniqueUrls.map(async (url) => {
                const result = await convertOneLink(url);
                return { original: url, ...result };
            })
        );

        // Thay thế link trong văn bản gốc
        let resultText = text;
        conversions.forEach(item => {
            // Ưu tiên dùng link affiliate, nếu lỗi thì dùng link sạch
            const linkToUse = item.affiliate ? item.affiliate : item.clean;
            resultText = resultText.split(item.original).join(linkToUse);
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ resultText })
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Error' }) };
    }
};
