const express = require('express');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json())


// CONNECTED WITH DATABASE
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.it95s.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJwt(req, res, next){
  const authHeader = req.headers.authorization;
  if(!authHeader){
      return res.status(401).send({message: 'Unauthorized access'});
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
      if(err){
          return res.status(403).send({message: 'Forbiddedn Access'})
      }
      req.decoded = decoded;
      next();
  });
}

async function run(){
    try{
        await client.connect()
        // console.log('database connected');
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');

        app.get('/service', async(req, res)=>{
            const query = {};
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        })

        // warning
        // this is not the proper way to query.
        // after learning more about mongodb. use aggregate lookup, pipeline, match, group
        app.get('/available', async(req, res)=>{
            const date = req.query.date;
            // step 1: get all services
            const services = await servicesCollection.find().toArray();

            // step 2: get the booking of that day
            const query = {date: date};
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: get each service
            services.forEach(service =>{
                // step 4: find bookings for that sevice. output : [{},{},{},{}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                // step 5: selcet slots for the service Bookings: ['', '', ''. '']
                const bookedSlots = serviceBookings.map(book => book.slot);
                // step 6: select those slots that are not in bookedslots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                // step 7: set available to slots to make it esier
                service.slots = available;
            })
            
            res.send(services);
        })

        /**
         * API Naming Convention
         * app.get('/booking') // get all bookings in this collection. or get more than one by filter
         * app.get('/booking/:id') // get a specific booking
         * app.post('/booking') // add a new booking 
         * app.patch('/booking/:id')// updating booking 
         * app.delete('/booking/:id')// deleting booking
         */ 

        app.get('/user', verifyJwt, async(req,res)=>{
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        app.get('/admin/:email', async(req, res)=>{
            const email = req.params.email;
            const user = await userCollection.findOne({email: email});
            const isAdmin = user.role === 'admin';
            res.send({admin: isAdmin});
        })

        app.put('/user/admin/:email', verifyJwt, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({email: requester});
            if(requesterAccount.role === 'admin'){
                const filter = {email: email} ;
                const updateDoc = {
                    $set: {role: 'admin'},
                }
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else{
                res.status(403).send({message: 'Forbidden'});
            }
            
        });
        

        app.put('/user/:email', async(req, res)=>{
            const email = req.params.email;
            const user = req.body;
            const filter = {email: email} ;
            const options = {upsert: true};
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'} )
            res.send({result, token});
            
        })

        app.get('/booking', verifyJwt, async(req, res)=>{
            const patient= req.query.patient;
            const decodedEmail = req.decoded.email;
            if(patient === decodedEmail){
                const query = {patient: patient};
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else{
                return res.status(403).send({message: 'forbidden access'});
            }
        })

        app.post('/booking', async(req, res)=>{
            const booking = req.body;  
            const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient}
            const exists = await bookingCollection.findOne(query);
            if(exists){
                return res.send({success: false, booking: exists})
            }
            const result = bookingCollection.insertOne(booking);
            return res.send({success: true, result});
        })

        
    }
    finally{

    }
}
run().catch(console.dir);



app.get('/', (req, res)=>{
    res.send('Welcome to doctors portal server side');
})

app.listen(port, ()=>{
    console.log('Listening to the PORT: ', port);
})