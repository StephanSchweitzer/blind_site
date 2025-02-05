const { parse } = require('csv-parse/sync')
const fs = require('fs/promises')

import { prisma } from '@/lib/prisma';

interface BookCSV {
    title: string
    author: string
    published_date: string
    description: string
    isbn: string
    genres: string // Assuming genres are comma-separated
}

async function importBooks() {
    try {
        // Read the CSV file
        const fileContent = await fs.readFile('final_books.csv', 'utf-8')

        // Parse CSV content
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        }) as BookCSV[]

        console.log(`Found ${records.length} books to process`)
        let skipped = 0
        let added = 0

        // Process each book
        for (const record of records) {
            // Split and clean genres before the try/catch
            const genreNames = record.genres
                .split(',')
                .map(g => g.trim())
                .filter(Boolean)

            // Create or connect genres before the try/catch
            const genreConnections = await Promise.all(
                genreNames.map(async (name) => {
                    const genre = await prisma.genre.upsert({
                        where: { name },
                        create: { name },
                        update: {},
                    })
                    return { genreId: genre.id }
                })
            )

            try {
                // Check if book already exists by title
                const existingBook = await prisma.book.findFirst({
                    where: {
                        title: record.title
                    }
                })

                if (existingBook) {
                    console.log(`Skipping existing book: ${record.title}`)
                    skipped++
                    continue
                }

                // Create the book
                await prisma.book.create({
                    data: {
                        title: record.title,
                        author: record.author,
                        publishedDate: record.published_date ? new Date(record.published_date) : null,
                        description: record.description || null,
                        isbn: record.isbn || null, // Make ISBN nullable if it's a duplicate
                        addedById: 1, // Replace with actual user ID who is importing
                        genres: {
                            create: genreConnections,
                        },
                    },
                })
                console.log(`Added new book: ${record.title}`)
                added++
            } catch (error) {
                console.error(`Error processing book "${record.title}":`, error)
                // If there's an error, try without ISBN
                try {
                    await prisma.book.create({
                        data: {
                            title: record.title,
                            author: record.author,
                            publishedDate: record.published_date ? new Date(record.published_date) : null,
                            description: record.description || null,
                            isbn: null, // Set ISBN to null for duplicate cases
                            addedById: 1,
                            genres: {
                                create: genreConnections,
                            },
                        },
                    })
                    console.log(`Added book (without ISBN): ${record.title}`)
                    added++
                } catch (retryError) {
                    console.error(`Failed to process book even without ISBN: ${record.title}`)
                    continue
                }
            }
        }

        console.log('\nImport completed!')
        console.log(`Total books processed: ${records.length}`)
        console.log(`Books skipped (already existed): ${skipped}`)
        console.log(`New books added: ${added}`)
    } catch (error) {
        console.error('Error during import:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

// Run the import
importBooks()