FROM eclipse-temurin:17-jdk-jammy

# Install Node.js
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm ci

# Copy everything else
COPY . .

# Download the Lavalink jar into the folder
ADD https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/Lavalink.jar ./lavalink/Lavalink.jar

# IMPORTANT: Give the script permission to run
RUN chmod +x start.sh

# Run the wrapper script
CMD ["./start.sh"]