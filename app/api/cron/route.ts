import Product from "@/lib/models/product.model";
import { connectDB } from "@/lib/mogoose";
import { scrapeAmazonProduct } from "@/lib/scrapper";
import { generateEmailBody, sendEmail } from "@/lib/nodemailer";
import { getAveragePrice, getEmailNotifType, getHighestPrice, getLowestPrice } from "@/lib/utils";
import { NextResponse } from "next/server";

export const maxDuration = 300; // 5min
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    try {
        await connectDB();

        const products = await Product.find({});
        if (!products) throw new Error("No products found");

        const updatedProducts = await Promise.all(
            products.map(async (currentProduct) => {
                const scrappedProduct = (await scrapeAmazonProduct(currentProduct.url)) as any;
                if (!scrappedProduct) throw new Error("No product found");

                const updatedPriceHistory = [
                    ...currentProduct.priceHistory,
                    { price: scrappedProduct.currentPrice, date: new Date() },
                ];

                const product = {
                    ...scrappedProduct,
                    priceHistory: updatedPriceHistory,
                    lowestPrice: getLowestPrice(updatedPriceHistory),
                    highestPrice: getHighestPrice(updatedPriceHistory),
                    averagePrice: getAveragePrice(updatedPriceHistory),
                };

                const updatedProduct = await Product.findOneAndUpdate(
                    { url: product.url },
                    product,
                    { new: true }
                );

                const emailNotification = getEmailNotifType(scrappedProduct, currentProduct as any);

                if (emailNotification && updatedProduct.users.length > 0) {
                    const productInfo = {
                        title: updatedProduct.title,
                        url: updatedProduct.url,
                    };

                    const emailContent = await generateEmailBody(productInfo, emailNotification);
                    const userEmails = updatedProduct.users.map((user: any) => user.email);
                    await sendEmail(emailContent, userEmails);
                }

                return updatedProduct;
            })
        );

        return NextResponse.json({
            message: "OK",
            data: updatedProducts,
        });
    } catch (error) {
        throw new Error(`Error in GET: ${error}`);
    }
}
