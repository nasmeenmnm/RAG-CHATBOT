

import os
from pathlib import Path
from pydantic import BaseModel
from fastapi import FastAPI, UploadFile
from pinecone.grpc import PineconeGRPC as Pinecone
from langchain_pinecone.vectorstores import PineconeVectorStore
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.document_loaders import  PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.chains import  RetrievalQA
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(description="RAG-Chat-Bot")



# Add CORS middleware to allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all HTTP methods (POST, GET, etc.)
    allow_headers=["*"],  # Allows all headers
)

# Environment setup for uploads directory 
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Global pinecone conector 
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))


# GLobal pinecone index access
index = pc.Index(str(os.environ.get("PINECONE_INDEX")))

# GLobal Embedding Model Access 
embeddings = GoogleGenerativeAIEmbeddings(
        model=str(os.environ.get("GEMINI_EMBEDDING_MODEL")),
        google_api_key=os.environ.get("GOOGLE_API_KEY") # type: ignore
    )

# Global Vector Database access 
vector_store = PineconeVectorStore(index=index, embedding=embeddings)


# Global Gemini Chat Model Connector 
gemini_chat_model = ChatGoogleGenerativeAI(
    model=os.environ.get("GEMINI_CHAT_MODEL"),
    google_api_key=os.environ.get("GOOGLE_API_KEY"), # type: ignore
)


# UserQuery type 
class UserQuery(BaseModel):
    query: str

@app.post("/uploadfile")
async def create_upload_file(file: UploadFile):
    
    # Setting up the save location in backend 
    file_path = UPLOAD_DIR / str(file.filename)
    
    # Save the file in the backend 
    with open(file_path, "wb") as f:
        f.write(await file.read())
    
    # 5. Load the pdf using langchain PDF Loader in directory 
    loader = PyPDFLoader(file_path=file_path)
    documents = loader.load()
    
    # 6. Split the text Using recursive text spliter
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    docs = text_splitter.split_documents(documents)

    # 7. Insert the Embedding with corusponding Chunk to the vector database 
    confirmation  = vector_store.add_documents(documents=docs)
    length_confirmation = len(confirmation) 
    
    return {
        "filename": file.filename, 
        "file_path": file_path, 
        "confirmation": f"Successfully store {length_confirmation} docs in the vector store"
        }

    
@app.post("/chat")
def chat(userRequest: UserQuery):
    
    # Setting up the vector store as a retriver 
    retriever = vector_store.as_retriever(
        search_kwargs={"k": 3}
    )
    
    # Setting up the retrival QAChain 
    qa_chain = RetrievalQA.from_chain_type(llm=gemini_chat_model, retriever=retriever)
    
    # invoke the qa_chain 
    response = qa_chain.invoke(userRequest.query)
    
    return {"response": response}
    
    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app=app, host="0.0.0.0", port=8000)


