import 'dotenv/config'

import express from 'express'
import mysql from 'mysql2'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import { v2 as cloudinary } from 'cloudinary'

const app = express()

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

app.use(cors())
app.use(express.json())


app.use('/uploads', express.static(path.resolve('uploads')))

// Multer configuration
const upload = multer({
    storage: multer.memoryStorage(),

    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png'
        ]

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error('Only JPG, JPEG and PNG images are allowed'))
        }
    }
})

const uploadToCloudinary = buffer => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'toddler-app'
            },
            (error, result) => {
                if (error) {
                    reject(error)
                } else {
                    resolve(result)
                }
            }
        )

        stream.end(buffer)
    })
}


// MySQL connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 20000
})

db.connect(err => {
    if (err) {
        console.log('Database connection failed:', err)
    } else {
        console.log('MySQL connected')
    }
})


// =========================
// GET
// =========================

app.get('/data', (req, res) => {

    const sql = 'SELECT * FROM items'

    db.query(sql, (err, data) => {

        if (err) {
            console.log(err)

            return res.status(500).json({
                message: 'Failed to load data'
            })
        }

        res.json(data)
    })
})


// =========================
// INSERT
// =========================

app.post('/data', upload.single('img'), async (req, res) => {
    const {
        name,
        no_t,
        color,
        place,
        nut_sc,
        gt,
        category
    } = req.body

    // Upload image to Cloudinary
    let img = ''

    if (req.file) {
        try {
            const result = await uploadToCloudinary(req.file.buffer)
            img = result.secure_url
        } catch (error) {
            console.error('Cloudinary upload failed:', error)

            return res.status(500).json({
                message: 'Image upload failed'
            })
        }
    }

    const sql = `
        INSERT INTO items
        (name, img, no_t, color, place, nut_sc, gt, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `

    const values = [
        name,
        img,
        no_t,
        color,
        place,
        nut_sc,
        gt,
        category
    ]

    db.query(sql, values, (err, result) => {

        if (err) {
            console.log(err)

            return res.status(500).json({
                message: 'Insert failed'
            })
        }

        res.json({
            message: 'Inserted successfully',
            id: result.insertId
        })
    })
})


// =========================
// UPDATE
// =========================

app.put(
    '/data/:name/:category',
    upload.single('img'),
    async (req, res) => {

        const oldName = req.params.name
        const oldCategory = req.params.category

        const {
            name,
            no_t,
            color,
            place,
            nut_sc,
            gt,
            category
        } = req.body

        let sql
        let values

        // --------------------------------
        // New image was selected
        // --------------------------------

        if (req.file) {
            let img = ''

            try {
                const result = await uploadToCloudinary(req.file.buffer)
                img = result.secure_url
            } catch (error) {
                console.error('Cloudinary upload failed:', error)

                return res.status(500).json({
                    message: 'Image upload failed'
                })
            }

            sql = `
                UPDATE items
                SET
                    name = ?,
                    img = ?,
                    no_t = ?,
                    color = ?,
                    place = ?,
                    nut_sc = ?,
                    gt = ?,
                    category = ?
                WHERE name = ? AND category = ?
            `

            values = [
                name,
                img,
                no_t,
                color,
                place,
                nut_sc,
                gt,
                category,
                oldName,
                oldCategory
            ]

        }

        // --------------------------------
        // No new image selected
        // --------------------------------

        else {

            sql = `
                UPDATE items
                SET
                    name = ?,
                    no_t = ?,
                    color = ?,
                    place = ?,
                    nut_sc = ?,
                    gt = ?,
                    category = ?
                WHERE name = ? AND category = ?
            `

            values = [
                name,
                no_t,
                color,
                place,
                nut_sc,
                gt,
                category,
                oldName,
                oldCategory
            ]
        }


        db.query(
            'SELECT img FROM items WHERE name = ? AND category = ?',
            [oldName, oldCategory],
            (selectErr, oldItems) => {
                if (selectErr) {
                    console.log(selectErr)

                    return res.status(500).json({
                        message: 'Update failed'
                    })
                }

                db.query(sql, values, (err, result) => {

                    if (err) {
                        console.log(err)

                        return res.status(500).json({
                            message: 'Update failed'
                        })
                    }

                    if (result.affectedRows === 0) {

                        return res.status(404).json({
                            message: 'Item not found'
                        })
                    }

                    res.json({
                        message: 'Updated successfully'
                    })
                })
            }
        )
    }
)


// =========================
// DELETE
// =========================

app.delete('/data/:name/:category', (req, res) => {

    const name = req.params.name
    const category = req.params.category

    db.query(
        'SELECT img FROM items WHERE name = ? AND category = ?',
        [name, category],
        (selectErr, items) => {
            if (selectErr) {
                console.log(selectErr)

                return res.status(500).json({
                    message: 'Delete failed'
                })
            }

            const sql = `
                DELETE FROM items
                WHERE name = ? AND category = ?
            `

            db.query(sql, [name, category], (err, result) => {

                if (err) {
                    console.log(err)

                    return res.status(500).json({
                        message: 'Delete failed'
                    })
                }

                if (result.affectedRows === 0) {

                    return res.status(404).json({
                        message: 'Item not found'
                    })
                }


                res.json({
                    message: 'Deleted successfully'
                })
            })
        }
    )
})


// =========================
// ROOT
// =========================

app.get('/', (req, res) => {
    res.json('From Backend Side')
})


// =========================
// ERROR HANDLER
// =========================

app.use((err, req, res, next) => {

    console.log('Server error:', err)

    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            message: err.message
        })
    }

    if (err.message === 'Only JPG, JPEG and PNG images are allowed') {
        return res.status(400).json({
            message: err.message
        })
    }

    res.status(500).json({
        message: 'Server error'
    })
})


// =========================
// START SERVER
// =========================

const PORT = Number(process.env.PORT || 8081)

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`)
})
