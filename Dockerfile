FROM eclipse-temurin:17-jdk-jammy

RUN apt-get update && apt-get install -y curl dos2unix && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Download the jar directly using curl for reliability
RUN mkdir -p lavalink && \
    curl -L https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/Lavalink.jar -o ./lavalink/Lavalink.jar

RUN dos2unix start.sh && chmod +x start.sh

# Use ENTRYPOINT instead of CMD to prevent Railway overrides
ENTRYPOINT ["./start.sh"]