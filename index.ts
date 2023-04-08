import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import mongoose from "mongoose";
import JWT from "jsonwebtoken";

const JWT_SECRET = "secret";

mongoose.connect("mongodb://127.0.0.1:27017/store");
mongoose.connection
  .once("open", () => console.log("connected"))
  .on("error", (error) => {
    console.log("my error", error);
  });

interface User {
  id: string;
  name: string;
  email: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
}

interface Order {
  id: string;
  user: User;
  products: Product[];
  status: string;
  totalPrice: number;
  createdAt: string;
}

interface Query {
  products: Product[];
  orders: Order[];
  order: Order | undefined;
  userOrders: Order[];
}

interface ProductInput {
  name: string;
  description: string;
  price: number;
  image: string;
}

interface UpdateProductInput {
  id: string;
  name?: string;
  description?: string;
  price?: number;
  image?: string;
}

interface CreateOrderInput {
  userId: string;
  productIds: string[];
  status: string;
}

interface UpdateOrderStatusInput {
  id: string;
  status: string;
}

interface MyContext {
  // we'd define the properties a user should have
  // in a separate user interface (e.g., email, id, url, etc.)
  user: User;
}
interface Mutation {
  createProduct: (input: ProductInput) => Product;
  updateProduct: (input: UpdateProductInput) => Product;
  deleteProduct: (id: string) => boolean;
  createOrder: (input: CreateOrderInput) => Order;
  updateOrderStatus: (input: UpdateOrderStatusInput) => Order;
  signUp: (name: string, email: string, password: string) => string;
  signIn: (email: string, password: string) => string;
  signOut: () => boolean;
}

interface Subscription {
  orderStatusChanged: Order;
}

const typeDefs = `
  type User {
    id: ID!
    name: String!
    email: String!
    password: String!
  }
  
  type Product {
    id: ID!
    name: String!
    description: String!
    price: Float!
    image: String!
  }
  
  type Order {
    id: ID!
    user: User
    products: [Product]
    status: String
    totalPrice: Float
    createdAt: String
  }
  
  type Query {
    products: [Product!]!
    getProduct(id: ID!): Product
    orders: [Order!]!
    order(id: ID!): Order
    userOrders(userId: ID!): [Order!]!
  }
  
  type Status {
    message: String
  }
  type AuthData{
    userId: ID!
    token: String!
    tokenExpire: Int!
  }

  input ProductInput {
    name: String!
    description: String!
    price: Float!
    image: String!
  }
  
  input UpdateProductInput {
    id: ID!
    name: String
    description: String
    price: Float
    image: String
  }
  
  input CreateOrderInput {
    userId: ID!
    productIds: [ID!]!
  }
  
  input UpdateOrderStatusInput {
    id: ID!
    status: String!
  }

  type Mutation {
    createProduct(input: ProductInput!): Product!
    updateProduct(input: UpdateProductInput!): Product!
    deleteProduct(id: ID!): Status
    createOrder(input: CreateOrderInput!): Order
    updateOrderStatus(input: UpdateOrderStatusInput!): Status
    deleteOrder(id: ID!): Status
    signUp( name:String!, email: String!, password: String!): Status
    signIn(email: String!, password: String!): AuthData
    signOut: Boolean!
  }`;

// Define Mongoose schema for User, Product, and Order
const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
});

const ProductSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  image: String,
});

const OrderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  status: {
    type: String,
    enum: ["placed", "processing", "shipped", "delivered"],
    default: "placed",
    required: true,
  },
  totalPrice: Number,
  createdAt: Date,
});

const User = mongoose.model("User", UserSchema);
const Product = mongoose.model("Product", ProductSchema);
const Order = mongoose.model("Order", OrderSchema);

// Define resolvers for Query, Mutation, and Subscription
const resolvers = {
  Query: {
    products: async () => {
      const products = await Product.find();
      return products;
    },
    getProduct: async (_: unknown, { id }: { id: string }) => {
      console.log(id);
      const getProduct = await Product.findById(id);
      return getProduct;
    },
    orders: async () => {
      const orders = await Order.find().populate("user products");
      return orders;
    },
    order: async (_: unknown, { id }: { id: string }) => {
      const order = await Order.findById(id).populate("user products");
      return order;
    },
    userOrders: async (_: unknown, { userId }: { userId: string }) => {
      const orders = await Order.find({ user: userId }).populate(
        "user products"
      );
      return orders;
    },
  },
  Mutation: {
    createProduct: async (_: unknown, { input }: { input: ProductInput }) => {
      const { name, description, price, image } = input;
      const product = new Product({ name, description, price, image });
      await product.save();
      return product;
    },
    updateProduct: async (
      _: unknown,
      { input }: { input: UpdateProductInput }
    ) => {
      const { id, name, description, price, image } = input;
      const product = await Product.findByIdAndUpdate(
        id,
        { name, description, price, image },
        { new: true }
      );
      return product;
    },
    deleteProduct: async (_: unknown, { id }: { id: string }) => {
      const deleteProduct = await Product.findByIdAndDelete(id);
      if (!deleteProduct) {
        return {
          message: "Product already deleted",
        };
      }
      return {
        message: "Product deleted",
      };
    },

    createOrder: async (_: unknown, { input }: { input: CreateOrderInput }) => {
      const { userId, productIds, status } = input;
      const user = await User.findById(userId);
      if (!user) throw new Error("User not found");

      const products = await Product.find({ _id: { $in: productIds } });
      if (products.length !== productIds.length) {
        throw new Error(`One or more products not found`);
      }

      const totalPrice = products.reduce((acc, product) => {
        if (!product.price) {
          throw new Error(`Product price is undefined or null`);
        }
        console.log(acc + product.price);
        return acc + product.price;
      }, 0);
      // create the new order
      const order = new Order({
        user: userId,
        products: productIds,
        status,
        totalPrice,
        createdAt: new Date().toISOString(),
      });
      console.log(order);
      // save the order in the database
      await order.save();
      return order.populate("user products");
    },
    updateOrderStatus: async (
      _: unknown,
      { input }: { input: UpdateOrderStatusInput }
    ) => {
      const { id, status } = input;
      const order = await Order.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      ).populate("user products");
      if (!order) {
        throw new Error(`Order with id ${id} not found`);
      }
      return {
        order,
        message: "updated sucessfully",
      };
    },
    deleteOrder: async (_: unknown, { id }: { id: string }) => {
      const deleteOrder = await Order.findByIdAndDelete(id);
      if (!deleteOrder) {
        return {
          message: "Order already deleted",
        };
      }
      return {
        message: "Order Deleted",
      };
    },
    signUp: async (
      _: unknown,
      {
        name,
        email,
        password,
      }: { name: string; email: string; password: string }
    ) => {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error("User already exists");
      }
      const user = new User({ name, email, password });
      await user.save();
      const token = JWT.sign({ userId: user.id }, JWT_SECRET);
      return {
        token,
        id: user.id,
        message: "User Created",
      };
    },
    signIn: async (
      _: unknown,
      { email, password }: { email: string; password: string }
    ) => {
      const user = await User.findOne({ email });
      if (!user || user.password !== password) {
        throw new Error("Invalid email or password");
      }
      // Generate and return a JWT token here
      const token = JWT.sign({ userId: user.id }, JWT_SECRET);
      return {
        token: token,
        userId: user.id,
      };
    },
    signOut: async () => {
      // Destroy JWT token here
      return true;
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const { url } = await startStandaloneServer(server, {
  context: async ({ req, res }) => {
    // Get the user token from the headers
    const token = req.headers.authorization || "";

    try {
      // Verify the token
      const decoded = JWT.verify(token, JWT_SECRET) as { userId: string };

      // Find the user with the ID from the token
      const user = await User.findById(decoded.userId);

      // Add the user to the context
      return { user };
    } catch (err) {
      // Return null if there's an error or the token is invalid
      return { user: null };
    }
  },
  listen: { port: 3000 },
});

console.log(`Server running at: ${url}`);
