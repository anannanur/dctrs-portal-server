const express = require('express')
const cors = require('cors')
require('dotenv').config()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_ADMIN}:${process.env.DB_PASS}@cluster0.ez07kkz.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded
        next()
    });

}

async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db("dctrs_portal").collection("services")
        const bookingCollection = client.db('dctrs_portal').collection('bookings')
        const userCollection = client.db('dctrs_portal').collection('users')

        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services)
        })

        

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const authorization = req.headers.authorization;
            const decodedEmail = req.decoded.email;
            if (decodedEmail === patient) {
                console.log('auth header', authorization)
                const query = { patient: patient }
                const booking = await bookingCollection.find(query).toArray()
                return res.send(booking)
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' })
            }
        })

        app.get('/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin'
            res.send({ admin: isAdmin })
        })
        app.get('/users', verifyJWT, async (req, res) => {
            const query = {}
            const users = await userCollection.find(query).toArray();
            res.send(users)
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body
            const query = { treatment: booking.treatment, patient: booking.patient, date: booking.date }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking)
            return res.send({ success: true, result })
        })
        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email
            const requester = req.decoded.email
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                const filter = { email: email }
                const updateDoc = {
                    $set: { role: 'admin' }
                }
                const result = await userCollection.updateOne(filter, updateDoc)
                return res.send(result)
            }
            else {
                return res.status(403).send({ message: 'Forbidded' })
            }

        })
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: user
            }
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token })
        })

        // Warning: This is not the proper way to query multiple collection. 
        // After learning more about mongodb. use aggregate, lookup, pipeline, match, group
        app.get('/available', async (req, res) => {
            // const date = req.query.date || 'Dec 11, 2022';
            const date = req.query.date;

            // step 1:  get all services
            const services = await serviceCollection.find().toArray();

            // step 2: get the booking of that day. output: [{}, {}, {}, {}, {}, {}]
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each service
            services.forEach(service => {
                // step 4: find bookings for that service. output: [{}, {}, {}, {}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                // step 5: select slots for the service Bookings: ['', '', '', '']
                const bookedSlots = serviceBookings.map(book => book.slot);
                // step 6: select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                //step 7: set available to slots to make it easier 
                service.slots = available;
                // console.log(service)
            });


            res.send(services);
        })

        /**
         * API Naming Convention
         * app.get('/booking') // get all bookings in this collection. or get more than one or by filter
         * app.get('/booking/:id') // get a specific booking 
         * app.post('/booking') // add a new booking
         * app.patch('/booking/:id) //
         * app.delete('/booking/:id) //
        */

    } finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello from Doctor Uncle!')
})
app.get('/hello', async(req,res) =>{
    res.send('hello')
})

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})