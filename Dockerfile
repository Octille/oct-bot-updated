# 1. Base Image
FROM eclipse-temurin:17-jdk-jammy

# 2. Install Node.js and curl
RUN apt-get update && apt-get install -y curl dos2unix && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

WORKDIR /app

# 3. Handle Node Dependencies
COPY package*.json ./
RUN npm ci

# 4. Copy everything else
COPY . .

# 5. DOWNLOAD LAVALINK (Using curl instead of ADD)
# We make the directory first to be safe
RUN mkdir -p lavalink && \
    curl -L https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/Lavalink.jar -o ./lavalink/Lavalink.jar

# 6. Final Prep
RUN dos2unix start.sh && chmod +x start.sh

# 7. Start Command
CMD ["./start.sh"]