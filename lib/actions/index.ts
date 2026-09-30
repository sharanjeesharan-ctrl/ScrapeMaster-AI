'use server'

import { revalidatePath } from "next/cache";
import Product from "../models/product.model";
import { scrapeAmazonProduct } from "../scrapper";
import { getAveragePrice, getHighestPrice, getLowestPrice } from "../utils";
import { generateEmailBody, sendEmail } from "../nodemailer";
import { connectDB } from "../mogoose";

export async function scrapeAndStoreProduct(productURL: string) {
    if (!productURL) return;

    try {
        await connectDB();
        const scrapedProduct = await scrapeAmazonProduct(productURL) as unknown as { url: string; currentPrice: number; [key: string]: any };
        if (!scrapedProduct) return;

        let product = scrapedProduct;
        const existingProduct = await Product.findOne({ url: scrapedProduct.url });
        if (existingProduct) {
            const updatedPriceHistory = [
                ...existingProduct.priceHistory,
                { price: scrapedProduct.currentPrice, date: new Date() }
            ];
            product = {
                ...scrapedProduct,
                priceHistory: updatedPriceHistory,
                lowestPrice: getLowestPrice(updatedPriceHistory),
                highestPrice: getHighestPrice(updatedPriceHistory),
                averagePrice: getAveragePrice(updatedPriceHistory),
            };
            await Product.updateOne({ url: scrapedProduct.url }, product);
        } else {
            const newProduct = new Product({
                ...scrapedProduct,
                priceHistory: [{ price: scrapedProduct.currentPrice, date: new Date() }],
                lowestPrice: scrapedProduct.currentPrice,
                highestPrice: scrapedProduct.currentPrice,
                averagePrice: scrapedProduct.currentPrice,
            });
            await newProduct.save();
        }

        console.log('Scraped Product:', product);
        
    } catch (error: any) {
        throw new Error(`Failed to create product: ${error.message}`);
    }
}

export async function getAllProducts() {
    try {
        await connectDB();

        const products = await Product.find({});

        return products;
    } catch (error: any) {
        console.log(error);
        throw new Error(`Failed to get products: ${error.message}`);
    }
}

export async function getProductById(productId: string) {
    try {
        await connectDB();
        const product = await Product.findOne({ _id: productId });
        if (!product) return null;
        return JSON.parse(JSON.stringify(product));
    } catch (error: any) {
        console.log(error);
        return null;
    }
}

export async function getSimilarProducts(productId: string) {
    try {
        await connectDB();
        const currentProduct = await Product.findById(productId);
        if (!currentProduct) return null;
        const similarProducts = await Product.find({ _id: { $ne: productId } }).limit(3);
        return JSON.parse(JSON.stringify(similarProducts));
    } catch (error: any) {
        console.log(error);
        return null;
    }
}

export async function addUserEmailToProduct(productId: string, userEmail: string) {
    try {
        await connectDB();
        const product = await Product.findById(productId);
        if (!product) return;
        const userExists = product.users.some((user: { email: string }) => user.email === userEmail);
        if (!userExists) {
            product.users.push({ email: userEmail });
            await product.save();
        }
    } catch (error: any) {
        console.log(error);
    }
}
